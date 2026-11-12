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

    @Column({ type: "text", nullable: true })
    name?: string | null;

    @Column({ type: "text", nullable: true })
    details?: string | null;

    @Column({ type: "smallint", nullable: true })
    rarity?: number | null;

    @Column({ type: "text", nullable: true })
    tagline?: string | null;

    @Column({ type: "boolean", default: false })
    is_legacy: boolean = false;

    @Column({ type: "text", nullable: true })
    obtained_at?: string | null;

    @Column()
    icon: string;

    @Column({ type: "text", nullable: true })
    link?: string | null;
}
