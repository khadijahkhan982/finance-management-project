import { Entity, Column, BaseEntity, PrimaryGeneratedColumn, OneToOne, JoinColumn, ManyToOne, CreateDateColumn, UpdateDateColumn} from "typeorm"
import { User } from "./User";
import { Asset } from "./Asset";
import { Category } from "./Category";
import { TransactionType } from "../utils/enums";


@Entity('transaction')
export class Transaction extends BaseEntity {
    @PrimaryGeneratedColumn( { type: "bigint" } )
    id: number

    @Column({ type: "decimal", precision: 10, scale: 2 })
    amount: number;

     @CreateDateColumn({ type: "timestamp", default: () => "CURRENT_TIMESTAMP(6)" })
       transaction_date: Date; 

    @Column({nullable: true})
    description: string;

    @Column()
    transaction_type: TransactionType;

    
 @ManyToOne(() => User)
  @JoinColumn({ name: "user_id" })
  user: User;
 
@ManyToOne(() => Asset)
  @JoinColumn({ name: "asset_id" })
  asset: Asset;

@ManyToOne(() => Category)
  @JoinColumn({ name: "category_id" })
  category: Category;

  @CreateDateColumn({ type: "timestamp", default: () => "CURRENT_TIMESTAMP(6)" })
    created_at: Date; 

    @UpdateDateColumn({ type: "timestamp", default: () => "CURRENT_TIMESTAMP(6)", onUpdate: "CURRENT_TIMESTAMP(6)" })
    updated_at: Date; 

}