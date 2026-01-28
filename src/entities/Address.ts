import { Status } from "../utils/enums";
import { Entity, UpdateDateColumn,Column, CreateDateColumn,BaseEntity, PrimaryGeneratedColumn, OneToOne, JoinColumn, ManyToOne, OneToMany} from "typeorm"
import { Transaction } from "./Transaction";
import { Asset } from "./Asset";
import { User } from "./User";



@Entity('address')

export class Address extends BaseEntity {
    @PrimaryGeneratedColumn( { type: "bigint" } )
    id: number

    @Column()
    street: string;

    @Column()
    house_number: string;

    @Column()
    city: string;

    @Column()
    country: string;

   @OneToOne(() => User, (user) => user.address)
   user: User;

   @CreateDateColumn({ type: "timestamp", default: () => "CURRENT_TIMESTAMP(6)" })
    created_at: Date; 

    @UpdateDateColumn({ type: "timestamp", default: () => "CURRENT_TIMESTAMP(6)", onUpdate: "CURRENT_TIMESTAMP(6)" })
    updated_at: Date; 
}