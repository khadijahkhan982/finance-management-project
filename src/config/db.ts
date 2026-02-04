import 'reflect-metadata';
import { DataSource } from 'typeorm';
import dotenv from 'dotenv';

import { User } from '../entities/User';
import { Transaction } from '../entities/Transaction';
import { Asset } from '../entities/Asset';
import { Category } from '../entities/Category';
import { Address } from '../entities/Address';
import { UserSessions } from '../entities/UserSessions';

dotenv.config();

export const AppDataSource = new DataSource({
    type: "postgres",
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 5432,
    username: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    entities: [User, Transaction, Asset, Category, Address, UserSessions],
    synchronize: true, 
    logging: process.env.NODE_ENV === 'development',
});