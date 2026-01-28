
import { Entity,Column, CreateDateColumn,BaseEntity, PrimaryGeneratedColumn, JoinColumn, ManyToOne} from "typeorm"
import { User } from "./User";

@Entity('user_sessions')
export class UserSessions extends BaseEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    token: string;

    @Column({ default: true })
    is_valid: boolean;

    @Column({ type: "timestamp" })
    expires_at: Date;

    @CreateDateColumn()
    created_at: Date;

    @ManyToOne(() => User, (user) => user.id, { onDelete: 'CASCADE' })
    @JoinColumn({ name: "user_id" })
    user: User;
}