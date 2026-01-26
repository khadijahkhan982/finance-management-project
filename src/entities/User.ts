import { Status } from "../utils/enums";
import { Entity, UpdateDateColumn,Column, CreateDateColumn,BaseEntity, PrimaryGeneratedColumn, OneToOne, JoinColumn, ManyToOne, OneToMany} from "typeorm"
import { Transaction } from "./Transaction";
import { Asset } from "./Asset";


@Entity('user')
export class User extends BaseEntity {
    @PrimaryGeneratedColumn( { type: "bigint" } )
    id: number

    @Column()
    full_name: string;

    @Column({ unique: true , nullable:true})
    email: string;

    @Column()
    phone_number: string;

    @Column()
    password: string;

    @Column({type: "varchar",nullable: true})
    token: string | null;
  @Column({ type: "timestamp", nullable: true })
    token_expires_at: Date | null;
     @Column()
    date_of_birth: Date;

    @Column({default: Status.is_active })
    status: Status

   @OneToMany(() => Transaction, (transaction) => transaction.user)
   transactions: Transaction[]

    @OneToMany(() => Asset, (asset) => asset.user)
   assets: Asset[]
   @CreateDateColumn({ type: "timestamp", default: () => "CURRENT_TIMESTAMP(6)" })
    created_at: Date; 

    @UpdateDateColumn({ type: "timestamp", default: () => "CURRENT_TIMESTAMP(6)", onUpdate: "CURRENT_TIMESTAMP(6)" })
    updated_at: Date; 




}