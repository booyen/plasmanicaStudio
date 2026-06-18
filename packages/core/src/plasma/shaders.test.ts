import { describe, it, expect } from 'vitest';
import { FIELDS, MATERIALS, FIELD_NAMES, MATERIAL_NAMES, buildFrag, VERT, FLOW_FRAG, PRE_A } from './shaders.js';
import { SHAPES, SHAPE_NAMES, GRADIENTS, NUMCFG } from './data.js';
import { THEMES } from './themes.js';

describe('extracted GLSL + data parity', () => {
  it('has the expected counts (12 fields, 14 materials, 7 shapes)', () => {
    expect(FIELDS.length).toBe(12);
    expect(MATERIALS.length).toBe(14);
    expect(SHAPES.length).toBe(7);
  });

  it('exposes the legacy names', () => {
    expect(FIELD_NAMES).toContain('Classic');
    expect(FIELD_NAMES).not.toContain('Aurora'); // Aurora is a material, not a field
    expect(MATERIAL_NAMES).toContain('Aurora');
    expect(MATERIAL_NAMES).toContain('Liquid Glass');
    expect(SHAPE_NAMES).toEqual(['Free', 'Linear', 'Circle', 'Angular', 'Spiral', 'Polar', 'Mirror']);
  });

  it('every field/material carries non-empty GLSL src', () => {
    for (const f of FIELDS) expect(f.src.length).toBeGreaterThan(10);
    for (const m of MATERIALS) expect(m.src.length).toBeGreaterThan(10);
  });

  it('buildFrag assembles in dependency order: PRE_A → plasma() → effect() → main()', () => {
    const frag = buildFrag(0, 0);
    const iPre = frag.indexOf('precision');
    const iPlasma = frag.indexOf('float plasma(');
    const iEffect = frag.indexOf('vec3 effect(');
    const iMain = frag.indexOf('void main(');
    expect(iPre).toBeGreaterThanOrEqual(0);
    expect(iPlasma).toBeGreaterThan(iPre);
    expect(iEffect).toBeGreaterThan(iPlasma);
    expect(iMain).toBeGreaterThan(iEffect);
  });

  it('preserves WebGL1 gotchas in the GLSL', () => {
    expect(VERT).toContain('attribute vec2 a_pos');         // WebGL1 attribute syntax
    expect(PRE_A).toContain('u_cm[5]');                     // float-flag array, not bitwise
    expect(FLOW_FRAG).toContain('precision');               // flowmap pass present
    expect(buildFrag(0, 0)).toContain('u_fmap');            // flowmap sampler name preserved
  });

  it('data blocks are present', () => {
    expect(Object.keys(GRADIENTS).length).toBeGreaterThan(3);
    expect(Object.keys(THEMES).length).toBeGreaterThan(3);
    expect(NUMCFG.speed).toBeDefined();
  });
});
