import { Entity, Column, BaseEntity, PrimaryGeneratedColumn, OneToOne, JoinColumn,OneToMany, ManyToOne, CreateDateColumn, UpdateDateColumn} from "typeorm"
import { User } from "./User";
import { Transaction } from "./Transaction";


@Entity('category')
export class Category extends BaseEntity {
    @PrimaryGeneratedColumn( { type: "bigint" } )
    id: number

    @Column()
    name: string;

    @Column()
    type: string;   

    @OneToMany(() => Transaction, (transaction) => transaction.category)
    transactions: Transaction[]

       @CreateDateColumn({ type: "timestamp", default: () => "CURRENT_TIMESTAMP(6)" })
        created_at: Date; 
    
        @UpdateDateColumn({ type: "timestamp", default: () => "CURRENT_TIMESTAMP(6)", onUpdate: "CURRENT_TIMESTAMP(6)" })
        updated_at: Date; 

}