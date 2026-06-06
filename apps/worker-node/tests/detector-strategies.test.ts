import { afterEach, describe, expect, test } from 'bun:test';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { DetectorService } from '../src/services/detector.service';

const tempRoots: string[] = [];

afterEach(async () => {
  const root = tempRoots.pop();

  if (root) {
    await fs.rm(root, { recursive: true, force: true });
  }
});

describe('DetectorService framework strategies', () => {
  test('extracts Next.js app-router pages, components, and APIs', async () => {
    const rootDir = await createFixture({
      'package.json': JSON.stringify({
        dependencies: {
          next: '^16.0.0',
          react: '^19.0.0',
        },
      }),
      'app/page.tsx': `
        import Link from 'next/link';
        import HeroCard from '../components/HeroCard';
        import { StatsService } from '../services/stats.service';
        import { apiClient } from '../services/api-client';

        export default async function Home() {
          await StatsService.load();
          await fetch('/api/stats');
          await apiClient.get('/api/campaigns');
          return <><Link href="/campaigns">Campaigns</Link><HeroCard /></>;
        }
      `,
      'app/campaigns/page.tsx': `export default function Campaigns() { return <main />; }`,
      'app/api/campaigns/route.ts': `export async function GET() { return Response.json([]); }`,
      'pages/api/legacy/[id].ts': `export default function handler() {}`,
      'components/HeroCard.tsx': `
        import CtaButton from './CtaButton';
        export default function HeroCard() { return <section><CtaButton /></section>; }
      `,
      'components/CtaButton.tsx': `export default function CtaButton() { return <button />; }`,
      'services/stats.service.ts': `export const StatsService = { load: () => fetch('/api/service-stats') };`,
      'services/api-client.ts': `export const apiClient = { get: (path: string) => fetch(path), loadUser: (id: string) => axios.get(\`/api/users/\${id}\`) };`,
    });

    const result = await new DetectorService().detectProject(rootDir);

    expect(result.framework).toBe('next');
    expect(result.scanGraph.pages[0]?.route).toBe('/');
    expect(result.scanGraph.pages[0]?.components.map((component) => component.name)).toContain('HeroCard');
    expect(result.scanGraph.pages[0]?.components.map((component) => component.name)).toContain('CtaButton');
    expect(result.scanGraph.pages[0]?.components.map((component) => component.name)).not.toContain('StatsService');
    expect(result.scanGraph.pages[0]?.apis).toContain('/api/stats');
    expect(result.scanGraph.pages[0]?.apis).toContain('/api/service-stats');
    expect(result.scanGraph.pages[0]?.apis).toContain('/api/campaigns');
    expect(result.scanGraph.pages[0]?.apis).toContain('/api/users/:param');
    expect(result.scanGraph.apis).toContain('/api/legacy/:id');
    expect(result.scanGraph.pages[0]?.links).toContain('/campaigns');
    expect(result.scanGraph.edges.some((edge) => edge.type === 'page_uses_component')).toBe(true);
    expect(result.scanGraph.edges.some((edge) => edge.type === 'component_uses_component')).toBe(true);
    expect(result.scanGraph.edges.some((edge) => edge.type === 'page_calls_api')).toBe(true);
    expect(result.scanGraph.edges.some((edge) => edge.type === 'page_links_page')).toBe(true);
  });

  test('extracts Vue/Vite views, imported components, and dynamic APIs', async () => {
    const rootDir = await createFixture({
      'package.json': JSON.stringify({
        dependencies: {
          vue: '^3.0.0',
          vite: '^7.0.0',
        },
      }),
      'src/views/Home.vue': `
        <template><UserCard /></template>
        <script setup lang="ts">
        import UserCard from '../components/UserCard.vue';
        axios.get(\`/api/users/\${id}\`);
        </script>
      `,
      'src/components/UserCard.vue': `<template><article /></template>`,
    });

    const result = await new DetectorService().detectProject(rootDir);

    expect(result.framework).toBe('vue-vite');
    expect(result.scanGraph.pages[0]?.route).toBe('/home');
    expect(result.scanGraph.pages[0]?.components.map((component) => component.name)).toContain('UserCard');
    expect(result.scanGraph.pages[0]?.apis).toContain('/api/users/:param');
  });

  test('extracts Laravel routes, Blade pages, includes, and APIs', async () => {
    const rootDir = await createFixture({
      'composer.json': JSON.stringify({
        require: {
          'laravel/framework': '^11.0',
        },
      }),
      'routes/web.php': `<?php Route::get('/', function () { return view('home'); });`,
      'resources/views/home.blade.php': `
        @include('partials.nav')
        <script>fetch('/api/profile')</script>
      `,
      'resources/views/partials/nav.blade.php': `<nav>Menu</nav>`,
    });

    const result = await new DetectorService().detectProject(rootDir);

    expect(result.framework).toBe('laravel');
    expect(result.scanGraph.pages.some((page) => page.route === '/')).toBe(true);
    expect(result.scanGraph.components.some((component) => component.name === 'nav')).toBe(true);
    expect(result.scanGraph.apis).toContain('/api/profile');
  });

  test('falls back to generic PHP pages', async () => {
    const rootDir = await createFixture({
      'public/index.php': `
        <?php include '../partials/header.php'; ?>
        <script>fetch('/api/raw')</script>
      `,
      'partials/header.php': `<header>Header</header>`,
    });

    const result = await new DetectorService().detectProject(rootDir);

    expect(result.framework).toBe('php');
    expect(result.scanGraph.pages[0]?.route).toBe('/');
    expect(result.scanGraph.components.some((component) => component.name === 'header')).toBe(true);
    expect(result.scanGraph.apis).toContain('/api/raw');
  });
});

async function createFixture(files: Record<string, string>): Promise<string> {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tlx-detector-'));
  tempRoots.push(rootDir);

  await Promise.all(
    Object.entries(files).map(async ([relativePath, contents]) => {
      const filePath = path.join(rootDir, relativePath);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, contents, 'utf8');
    }),
  );

  return rootDir;
}
