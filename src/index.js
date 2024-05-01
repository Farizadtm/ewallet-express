const express = require('express')
const { PrismaClient, TransactionStatus, TransactionType } = require('@prisma/client')
const moment = require('moment')

const prisma = new PrismaClient()
const app = express()
const PORT = process.env.PORT || 3000

app.use(express.json())

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

        const transaction = await prisma.transaction.create({
            data: {
                amount: amount,
                type: type,
                status: isDebit ? 'PENDING' : 'FINISH',
                userId: account.userId,
                accountId: account.id
            }
        })

        if (isDebit) {
            return res.status(200).json({ data: transaction, message: 'berhasil' })
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
        res.status(200).json({ data: transaction, message: 'berhasil' })
    } catch (error) {
        res.status(500).json({ error: error })
    }
})

app.post('/payment', async (req, res) => {
    try {
        const { uidTransaction, userId } = req.body

        // Find and validate transaction
        const [transaction, account] = await Promise.all([
            prisma.transaction.findUnique({
                where: {
                    uid: uidTransaction
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
        const payment = await prisma.payment.create({
            data: {
                isSuccess: true,
                transactionId: transaction.id
            }
        })

        if (!payment.isSuccess) {
            return res.status(400).json({ message: 'Pembayaran tidak berhasil dilakukan' })
        }

        const updatedAccount = await prisma.account.update({
            where: {
                id: account.id
            },
            data: {
                amount: account.amount + transaction.amount,
                updatedAt: moment().format()
            }
        })
        res.status(200).json({ data: updatedAccount, message: 'Pembayaran berhasil' })
    } catch (error) {
        console.log(error)
        res.status(500).json({ error: error })
    }
})

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`)
})
