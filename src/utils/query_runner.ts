import { AppDataSource } from "../config/db";
import { EntityManager } from "typeorm";
 
export async function queryRunnerFunc<T>(
  work: (manager: EntityManager) => Promise<T>
): Promise<T> {
 const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();
 
  try {
    const result = await work(queryRunner.manager);
    await queryRunner.commitTransaction();
    return result;
  } catch (error) {
    if (queryRunner.isTransactionActive) {
      await queryRunner.rollbackTransaction();
    }
    throw error; 
  } finally {
   
      await queryRunner.release();
    
  }
}
 