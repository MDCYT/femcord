import { Column, Entity } from "typeorm";
import { BaseClassWithoutId } from "./BaseClass";

@Entity({
    name: "badges",
})
export class Badge extends BaseClassWithoutId {
    @Column({ primary: true })
    id: string;

    @Column()
    description: string;

    @Column({ nullable: true })
    name?: string | null;

    @Column({ nullable: true })
    details?: string | null;

    @Column({ type: "smallint", nullable: true })
    rarity?: number | null;

    @Column({ nullable: true })
    tagline?: string | null;

    @Column({ default: false })
    is_legacy: boolean = false;

    @Column({ nullable: true })
    obtained_at?: string | null;

    @Column()
    icon: string;

    @Column({ nullable: true })
    link?: string;
}
