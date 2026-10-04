import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { inspectTtf } from '../src/fonts';
const bytes = () => Uint8Array.from(readFileSync('tests/fixtures/fonts/test.ttf')).buffer;
describe('local font validation', () => {
  it('recognizes Unicode coverage and embedding permission', () => {
    const font = inspectTtf(bytes());
    expect(font.supports('中')).toBe(true);
    expect(font.supports('A')).toBe(true);
    expect(font.supports('龍')).toBe(false);
    expect(font.embeddable).toBe(true);
  });
  it('rejects truncated and out-of-bounds font directories', () => {
    expect(() => inspectTtf(new ArrayBuffer(4))).toThrow();
    const value = bytes(); new DataView(value).setUint32(20, value.byteLength + 1);
    expect(() => inspectTtf(value)).toThrow('越界');
  });
  it('rejects a damaged cmap and honors restricted embedding', () => {
    const value=bytes();const view=new DataView(value);
    for(let i=0;i<view.getUint16(4);i++) {
      const p=12+i*16;const name=String.fromCharCode(...new Uint8Array(value,p,4));
      if(name==='OS/2')view.setUint16(view.getUint32(p+8)+8,2);
    }
    expect(inspectTtf(value).embeddable).toBe(false);
    for(let i=0;i<view.getUint16(4);i++) {
      const p=12+i*16;const name=String.fromCharCode(...new Uint8Array(value,p,4));
      if(name==='cmap')view.setUint16(view.getUint32(p+8)+2,65535);
    }
    expect(()=>inspectTtf(value)).toThrow('cmap 损坏');
  });
});
