import type { FrameworkStrategy } from './types';
import { LaravelStrategy } from './laravel.strategy';
import { NextStrategy } from './next.strategy';
import { PhpStrategy } from './php.strategy';
import { VueViteStrategy } from './vue-vite.strategy';

export const strategies: FrameworkStrategy[] = [
  new NextStrategy(),
  new VueViteStrategy(),
  new LaravelStrategy(),
  new PhpStrategy(),
];

export type { FrameworkStrategy };
