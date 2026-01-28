// import 'reflect-metadata'; 
// import { Request, Response, NextFunction } from 'express';
// import jwt from 'jsonwebtoken';


// import dotenv from 'dotenv';


// import { DataSource, Repository } from "typeorm"
// import express from 'express';
// import { User } from './entities/User';
// import { Transaction } from './entities/Transaction';
// import { Asset } from './entities/Asset';
// import { Category } from './entities/Category';
// import { createUserRouter } from './routes/create_user';




// dotenv.config(); 

// const app = express();
//  export const AppDataSource = new DataSource({
//         type: "postgres",
//         host: process.env.DB_HOST,
//         port: Number (process.env.DB_PORT),
//         username: process.env.DB_USER,
//         password: process.env.DB_PASS,
//         database: process.env.DB_NAME,
//         entities: [User, Transaction, Asset, Category],
//         synchronize: true
//         })


        
// const main = async () => {
//     try {
//      await AppDataSource?.initialize();  
//       console.log("Connected to postgres");  
//       app.use(express.json()) 
//       app.use(createUserRouter)
   

  
//       app.listen(8080, ()=>{
//         console.log("now running on 8080");
        
//       })
//     } catch (error) {
//         console.error(error,"not able to connect"); 
//     }
// }
// main();

import 'reflect-metadata'; // Must be the first non-commented import
import dotenv from 'dotenv';
import express from 'express';
// Use DataSource for modern TypeORM initialization
import { DataSource } from 'typeorm'; 
import { logger } from "./utils/logger";

// --- Entity Imports ---
import { User } from './entities/User';
import { Transaction } from './entities/Transaction';
import { Asset } from './entities/Asset';
import { Category } from './entities/Category';

import userRouter from './routes/user';
import categoryRouter from './routes/category';
import assetRouter from './routes/asset';
import transactionRouter from './routes/transaction';
import { Address } from './entities/Address';
import { UserSessions } from './entities/UserSessions';


dotenv.config(); 

const app = express();


export const AppDataSource = new DataSource({
    type: "postgres",
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    username: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    entities: [User, Transaction, Asset, Category, Address, UserSessions],
    synchronize: true,
    logging: process.env.NODE_ENV === 'development',
});



const main = async () => {
    try {
        await AppDataSource.initialize();  
        logger.info("Connected to postgres database successfully.");
              console.log("Connected to postgres");  

        // 2. Middleware setup
        app.use(express.json()); 
        app.use('/api', userRouter); 
        app.use('/api', categoryRouter)
        app.use('/api', assetRouter)
        app.use('/api', transactionRouter)
       
        
        const PORT = process.env.APP_PORT || 8080; 

        app.listen(PORT, () => {
            logger.info(`Server is now running on port ${PORT}`);
                    console.log("now running on 8080");

        });

    } catch (error) {
        logger.fatal("Failed to connect to database or start server.", error); 
                console.error(error,"not able to connect"); 

        process.exit(1); // Exit process if startup fails
    }
};

main();

