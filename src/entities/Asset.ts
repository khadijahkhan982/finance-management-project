import { Entity, Column, BaseEntity, PrimaryGeneratedColumn, OneToOne, JoinColumn, ManyToOne, OneToMany, CreateDateColumn, UpdateDateColumn} from "typeorm"
import { User } from "./User";
import { Category } from "./Category";
import { Transaction } from "./Transaction";


@Entity('asset')
export class Asset extends BaseEntity {
    @PrimaryGeneratedColumn( { type: "bigint" } )
    id: number

    @Column()
    name: string;

    @Column({ type: "decimal", precision: 10, scale: 2     })
    original_cost: number;

    @Column({ type: "decimal", precision: 10, scale: 2 })
    current_cost: number;

    @ManyToOne(() => User)
    @JoinColumn({ name: "user_id" })
      user: User;
    
    @OneToMany(() => Transaction, (transaction) => transaction.asset)
      transactions: Transaction[]


      @CreateDateColumn({ type: "timestamp", default: () => "CURRENT_TIMESTAMP(6)" })
       created_at: Date; 
   
       @UpdateDateColumn({ type: "timestamp", default: () => "CURRENT_TIMESTAMP(6)", onUpdate: "CURRENT_TIMESTAMP(6)" })
       updated_at: Date; 


}