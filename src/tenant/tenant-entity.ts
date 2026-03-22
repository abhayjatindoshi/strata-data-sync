import type { BaseEntity } from '@strata/entity';
import type { EntityDef } from '@strata/schema';
import { defineEntity } from '@strata/schema';

export type BaseTenant = BaseEntity & {
  readonly name: string;
};

export type TenantDef<TCustom = object> = EntityDef<'__tenant', BaseTenant & TCustom>;

export function defineTenant<TCustom = object>(): TenantDef<TCustom> {
  return defineEntity<BaseTenant & TCustom>('__tenant') as TenantDef<TCustom>;
}
