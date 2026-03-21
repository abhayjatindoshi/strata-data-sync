import type { BaseEntity } from '../entity/index.js';
import type { EntityDef } from '../schema/index.js';
import { defineEntity } from '../schema/index.js';

export type BaseTenant = BaseEntity & {
  readonly name: string;
};

export type TenantDef<TCustom = object> = EntityDef<'__tenant', BaseTenant & TCustom>;

export function defineTenant<TCustom = object>(): TenantDef<TCustom> {
  return defineEntity<BaseTenant & TCustom>('__tenant') as TenantDef<TCustom>;
}
