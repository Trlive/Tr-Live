import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { regionForCountry, REGIONS } from '../src/regions.js';

test('bölge: Türkiye ve Orta Asya Uzbekistan sekmesinde; Arap, Hindistan, Avrupa ve diğerleri', () => {
  for (const c of ['UZ', 'TR', 'tr', 'AZ', 'KZ', 'CY']) assert.equal(regionForCountry(c), 'uz', c);
  for (const c of ['SA', 'EG', 'IQ', 'AE']) assert.equal(regionForCountry(c), 'ar', c);
  for (const c of ['IN', 'PK', 'BD']) assert.equal(regionForCountry(c), 'in', c);
  for (const c of ['DE', 'GB', 'US', 'AU']) assert.equal(regionForCountry(c), 'eu', c);
  assert.equal(regionForCountry(''), 'uz');
  assert.equal(regionForCountry(null), 'uz');
});

test('migration: bölge kısıtı ve varsayılan REGIONS ile aynı', () => {
  const sql = fs.readFileSync(new URL('../src/migrations/067_regions.sql', import.meta.url), 'utf8');
  const m = sql.match(/users_region_check CHECK \(region IN \(([^)]*)\)\)/);
  assert.deepEqual(m[1].split(',').map((x) => x.trim().replace(/'/g, '')), REGIONS);
  assert.match(sql, /DEFAULT 'uz'/);
});
