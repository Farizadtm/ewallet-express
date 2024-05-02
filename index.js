const express = require('express')
const path = require('path')
const { PrismaClient, TransactionStatus, TransactionType, Role } = require('@prisma/client')
const moment = require('moment')
const axios = require('axios')
const bodyParser = require('body-parser')
var session = require('express-session')
const { unescape } = require('querystring')

const prisma = new PrismaClient()
const app = express()
const PORT = process.env.PORT || 3030

app.use(express.json())
app.use(express.static(__dirname + '/public'))
app.use(bodyParser.urlencoded({ extended: false }))
// app.set('views', path.join(__dirname, 'views'))
app.set('view engine', 'ejs')
app.use(
    session({
        secret: 'farizz',
        resave: false,
        saveUninitialized: false
    })
)

app.get('/', async (req, res) => {
    const user = await prisma.user.findUnique({
        where: {
            id: parseInt(1)
        },
        include: {
            Account: true
        }
    })
    res.render('index', { data: user })
})

app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body
        if (!username || !password) {
            return res.status(400).json('Data harus lengkap')
        }

        const user = await prisma.user.findUnique({
            where: {
                username: username
            },
            include: {
                Account: true
            }
        })
        if (!user) {
            return res.status(404).json('Data tidak ditemukan')
        }

        if (user.password !== password) {
            return res.status(400).json('Password user salah')
        }

        if (user.username === 'admin') {
            req.session.user = { ...user }
            res.redirect('admin')
            return
        }

        req.session.user = { ...user }
        res.redirect('dashboard')
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
})

app.get('/dashboard', async (req, res) => {
    if (!req?.session || req.session?.user === undefined) {
        res.redirect('/')
    }
    const user = await prisma.user.findUnique({
        where: {
            username: req.session.user?.username
        },
        include: {
            Account: true,
            Transaction: true
        }
    })

    user.Transaction = {
        pending: user.Transaction.filter((v) => v.status === TransactionStatus.PENDING),
        history: user.Transaction
    }
    res.render('dashboard', { data: user })
})

app.get('/admin', async (req, res) => {
    if (!req?.session || req.session?.user === undefined) {
        res.redirect('/')
    }
    const users = await prisma.user.findMany({
        where: {
            role: Role.USER
        },
        include: {
            Account: true
        }
    })

    console.log(users)

    res.render('admin', { data: users })
})

app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            res.status(500).send('Error destroying session')
        } else {
            res.redirect('/')
        }
    })
})

// GET USER
app.get('/users', async (req, res) => {
    try {
        const users = await prisma.user.findMany()
        res.json(users)
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
})

// GET USER BY ID
app.get('/users/:id', async (req, res) => {
    try {
        const { id } = req.params
        const user = await prisma.user.findUnique({
            where: {
                id: parseInt(id)
            },
            include: {
                Account: true
            }
        })
        if (!user) {
            return res.status(404).json({ message: 'User tidak ditemukan' })
        }

        res.json(user)
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
})

// ADD
app.post('/account/:userId', async (req, res) => {
    try {
        const { userId } = req.params
        const account = await prisma.account.create({
            data: {
                userId: parseInt(userId),
                amount: 0
            }
        })
        res.status(200).json({ data: account, message: 'berhasil' })
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
})

// Create Transaction
app.post('/transaction/:userId', async (req, res) => {
    try {
        const { userId } = req.params
        const { amount, type } = req.body
        const isDebit = type === TransactionType.DEBIT
        const account = await prisma.account.findUnique({
            where: {
                userId: parseInt(userId)
            }
        })
        if (!account) {
            return res.status(404).json({ message: 'User tidak ditemukan' })
        }
        if (parseInt(amount) < 10000) {
            return res.status(404).json({ message: 'Input minimal 10000' })
        }

        const amountCode = Math.floor(Math.random() * 101) + 100
        const transaction = await prisma.transaction.create({
            data: {
                amount: parseInt(amount),
                amountCode: parseInt(amount) + amountCode,
                type: type,
                status: isDebit ? 'PENDING' : 'FINISH',
                userId: account.userId,
                accountId: account.id
            }
        })

        if (isDebit) {
            return res.redirect('/dashboard')
        }

        await prisma.account.update({
            where: {
                id: account.id
            },
            data: {
                amount: account.amount - transaction.amount,
                updatedAt: moment().format()
            }
        })
        res.redirect('/dashboard')
    } catch (error) {
        res.redirect('/dashboard')
        res.status(500).json({ error: error })
    }
})

app.post('/payment', async (req, res) => {
    try {
        const { uid, userId, amountCode } = req.body
        if (!uid || !userId) {
            return res.redirect('/dashboard')
        }

        // Find and validate transaction
        const [transaction, account] = await Promise.all([
            prisma.transaction.findUnique({
                where: {
                    uid: uid
                }
            }),
            prisma.account.findUnique({
                where: {
                    userId: parseInt(userId)
                }
            })
        ])
        if (!account || !transaction) {
            return res.status(404).json({ message: `${account ? 'Transaksi' : 'Dompet'} tidak ditemukan` })
        }

        if (transaction.status === TransactionStatus.FINISH) {
            return res.status(400).json({ message: 'Transaksi sudah dibayarkan' })
        }

        let isValid = (await payThirdApp(transaction, amountCode)) === 1 ? true : false

        await prisma.payment.create({
            data: {
                isSuccess: isValid,
                transactionId: transaction.id
            }
        })

        if (!isValid) {
            res.redirect('/dashboard')
        }

        await Promise.all([
            prisma.account.update({
                where: {
                    id: account.id
                },
                data: {
                    amount: isValid ? account.amount + transaction.amount : account.amount,
                    updatedAt: moment().format()
                }
            }),
            prisma.transaction.update({
                where: {
                    uid: uid
                },
                data: {
                    status: isValid ? TransactionStatus.FINISH : TransactionStatus.FAILED,
                    finishAt: moment().format()
                }
            })
        ])
        res.redirect('/dashboard')
    } catch (error) {
        res.redirect('/dashboard')
    }
})

async function payThirdApp(transaction, amountCode) {
    try {
        const data = {
            order_id: transaction.uid,
            amount: transaction.amount,
            timestamp: moment().format()
        }
        const header = {
            Authorization: `Bearer ${btoa(unescape('Fariz Aditama'))}`
        }

        // Just fake post
        await axios.post('https://yourdomain.com/deposit', data, { header: { header } })

        const isValid = transaction.amountCode === parseInt(amountCode)
        const response = {
            order_id: transaction.uid,
            amount: transaction.amount,
            status: isValid ? 1 : 2
        }

        return response.status
    } catch (error) {
        console.log(error)
    }
}

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`)
})
