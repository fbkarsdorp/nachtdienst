// Grain, vignette and a little bloom on the lamp. Darkness stays dark.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const FilmShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVignette: { value: 1.0 },
    uGrain: { value: 0.034 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uDim: { value: 0 },
    // 1: the picture mirrored left to right (the window, read from outside)
    uFlip: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime, uVignette, uGrain, uDim, uFlip; uniform vec2 uRes;
    varying vec2 vUv;
    float hash(vec2 p){ p = fract(p*vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
    void main(){
      vec2 uv = vec2(mix(vUv.x, 1.0 - vUv.x, uFlip), vUv.y);
      vec2 c = uv - 0.5;
      float r2 = dot(c, c);
      // a hint of lens fringing toward the corners
      vec2 off = c * r2 * 0.005;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + off).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - off).b;
      // warm the mids, cool the shadows
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col * vec3(0.92, 0.96, 1.08), col * vec3(1.06, 1.0, 0.9), smoothstep(0.02, 0.4, l));
      float vig = smoothstep(0.85, 0.22, r2 * uVignette * 1.7);
      col *= mix(0.45, 1.0, vig);
      float g = hash(uv * uRes + fract(uTime * 13.7) * 100.0) - 0.5;
      col += g * uGrain * (0.6 + 0.8 * (1.0 - l));
      col *= 1.0 - uDim;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export function makeComposer(renderer, scene, camera) {
  // multisampled, so edges stay clean through the passes
  const px = renderer.getDrawingBufferSize(new THREE.Vector2());
  const target = new THREE.WebGLRenderTarget(px.x, px.y, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const size = renderer.getSize(new THREE.Vector2());
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.4, 0.6, 0.93);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const film = new ShaderPass(FilmShader);
  composer.addPass(film);
  return {
    composer, bloom, film,
    setSize(w, h) {
      composer.setSize(w, h);
      film.uniforms.uRes.value.set(w, h);
    },
    render(time) {
      film.uniforms.uTime.value = time;
      composer.render();
    },
  };
}
