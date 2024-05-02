# Project Name

Short description or overview of your project.

## Table of Contents

- [Requirement](#requirement)
- [Installation](#installation)
- [Database Installation](#databaseinstallation)
- [Running](#running)

## Requirement
- Node Version >= 16, because im using prima for ORM

## Installation

Install keseluruhan package terlebih dahulu

```bash
npm install
```

## Database Installation
1. Create .env and add code
```bash
DATABASE_URL=<db>
```
For this project i already create db
link : postgresql://postgres:KeMichozywUVwIAQrtUkuxroPzOnCwBH@monorail.proxy.rlwy.net:49264/railway

2. Run command for generate prisma
```bash
prisma generate
```
IF not using my db, you can go next step

3. Run command for migration data schema to postgresql using :
```bash
prima db push
```

4. Add admin in users table from prisma studio by run command :
```bash
prisma studio
```
And you can add admin with role ADMIN

## Running
```bash
npm start
```
