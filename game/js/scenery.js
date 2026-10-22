// The room as built and lit in Blender (blender/build.py). This loads it, gives the
// baked surfaces their light back, and hands named pieces to the rest of the game.
//
// Baked surfaces ignore the real-time lights: their light comes from two lightmaps
// (the desk lamp, and everything else) so the lamp can flicker on its own, plus the
// small light you carry, which is added by hand. Props that are lit live (on the
// table, mostly) use the ordinary lights and reflect a capture of the room.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const DRACO = 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/gltf/';

// Shared by every baked material: change once, every surface follows.
// The bake is physically dim (a 40 W bulb in a big room); this lifts it to where the
// live lights sit, the same lift the Blender previews get from their exposure.
export const BAKE_GAIN = 5.5;

export const lighting = {
  uLampK: { value: 1 },
  uAmbK: { value: 1 },
  // morning: the baked light loses its colour and goes cold
  uGrey: { value: 0 },
  // moonlight: a cool fill that comes in at the window and dies away down the room
  // (the bake has the lamp and its bounce, almost nothing else). uMoonPos is in view space.
  uFill: { value: new THREE.Color(0, 0, 0) },
  uMoonPos: { value: new THREE.Vector3() },
  uCarryPos: { value: new THREE.Vector3() },
  uCarryColor: { value: new THREE.Color(0, 0, 0) },
  uCarryRange: { value: 4.5 },
  uSpecOcc: { value: 2.5 },
};

// three's light setup with the direct lights and ambient terms taken out
function bakedBegin() {
  let s = THREE.ShaderChunk.lights_fragment_begin;
  for (const k of ['NUM_POINT_LIGHTS', 'NUM_SPOT_LIGHTS', 'NUM_DIR_LIGHTS']) {
    s = s.replace(`#if ( ${k} > 0 ) && defined( RE_Direct )`, '#if 0');
  }
  s = s.replace('#if ( NUM_RECT_AREA_LIGHTS > 0 ) && defined( RE_Direct_RectArea )', '#if 0');
  s = s.replace('vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );', 'vec3 irradiance = vec3( 0.0 );');
  s = s.replace('#if ( NUM_HEMI_LIGHTS > 0 )', '#if 0');
  s = s.replace('#if defined( USE_LIGHT_PROBES )', '#if 0');
  return s;
}

function bakedMaps(mode) {
  const sample = mode === 'vertex'
    ? 'vec3 bakedL = vLmLamp * vLmLamp * uLampScale; vec3 bakedA = vLmAmb * vLmAmb * uAmbScale;'
    : 'vec3 bakedL = texture2D( lightMap, vLightMapUv ).rgb * uLampScale; vec3 bakedA = texture2D( lightMapAmb, vLightMapUv ).rgb * uAmbScale;';
  return /* glsl */`
  float specOcc = 1.0;
  #if defined( RE_IndirectDiffuse )
    ${sample}
    vec3 baked = bakedL * uLampK + bakedA * uAmbK;
    baked = mix( baked, vec3( dot( baked, vec3( 0.3, 0.59, 0.11 ) ) ) * vec3( 0.88, 0.94, 1.04 ), uGrey );
    irradiance += baked;
    vec3 mv = uMoonPos - geometryPosition;
    float md = length( mv );
    float mFace = saturate( dot( nonPerturbedNormal, mv / md ) );
    irradiance += uFill * ( 0.3 + 1.5 * mFace / ( 1.0 + pow2( md / 5.0 ) ) );
    // what you carry: a small warm light just below the eye
    vec3 cv = uCarryPos - geometryPosition;
    float cd = length( cv );
    float cf = pow2( saturate( 1.0 - pow4( cd / uCarryRange ) ) ) / max( cd * cd, 0.01 );
    // against the surface itself, not its normal map: grazing bumps would go black
    irradiance += uCarryColor * saturate( dot( nonPerturbedNormal, cv / cd ) ) * cf;
    specOcc = saturate( dot( baked, vec3( 0.3, 0.59, 0.11 ) ) * uSpecOcc + cf * 0.02 );
  #endif
  #if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
    radiance += getIBLRadiance( geometryViewDir, geometryNormal, material.roughness ) * specOcc;
  #endif
  `;
}

function patchBaked(mat, mode, scales, ambTex) {
  const own = {
    uLampScale: { value: Math.PI * BAKE_GAIN * scales.lamp },
    uAmbScale: { value: Math.PI * BAKE_GAIN * scales.amb },
    lightMapAmb: { value: ambTex || null },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, lighting, own);
    let head = 'uniform float uLampK, uAmbK, uGrey, uCarryRange, uSpecOcc, uLampScale, uAmbScale;\nuniform vec3 uCarryPos, uCarryColor, uFill, uMoonPos;\n';
    if (mode === 'vertex') {
      head += 'varying vec3 vLmLamp; varying vec3 vLmAmb;\n';
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 color;\nattribute vec4 color_1;\nvarying vec3 vLmLamp; varying vec3 vLmAmb;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLmLamp = color.rgb; vLmAmb = color_1.rgb;');
    } else {
      head += 'uniform sampler2D lightMapAmb;\n';
    }
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + head)
      .replace('#include <lights_fragment_begin>', bakedBegin())
      .replace('#include <lights_fragment_maps>', bakedMaps(mode));
  };
  mat.customProgramCacheKey = () => 'baked-' + mode;
  mat.userData.baked = mode;
}

function loadTexture(loader, url, srgb) {
  return new Promise((resolve) => {
    loader.load(url, (t) => {
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      resolve(t);
    }, undefined, () => resolve(null));
  });
}

export async function loadScenery(renderer) {
  const draco = new DRACOLoader().setDecoderPath(DRACO);
  const gltfLoader = new GLTFLoader().setDRACOLoader(draco);
  const texLoader = new THREE.TextureLoader();
  const [gltf, manifest] = await Promise.all([
    gltfLoader.loadAsync('models/room.glb'),
    fetch('models/room.json').then((r) => r.json()),
  ]);
  const aniso = renderer.capabilities.getMaxAnisotropy();

  // lightmaps
  const lm = {};
  await Promise.all(Object.entries(manifest.lightmaps).map(async ([atlas, chans]) => {
    const [lamp, amb] = await Promise.all([
      loadTexture(texLoader, `models/${chans.lamp.file}`, true),
      loadTexture(texLoader, `models/${chans.amb.file}`, true),
    ]);
    for (const t of [lamp, amb]) {
      t.flipY = false;
      t.channel = 1;
      // no mipmaps: at a grazing look the small levels blur neighbouring islands of the
      // atlas into each other (pale and dark patches on the walls); light is smooth anyway
      t.generateMipmaps = false;
      t.minFilter = THREE.LinearFilter;
    }
    lm[atlas] = { lamp, amb, scales: { lamp: chans.lamp.scale, amb: chans.amb.scale } };
  }));

  // the room's own texture sets, shared
  const texCache = new Map();
  const tex = async (file, srgb) => {
    if (!file) return null;
    if (!texCache.has(file)) {
      texCache.set(file, loadTexture(texLoader, `models/${file}`, srgb).then((t) => {
        if (t) {
          t.wrapS = t.wrapT = THREE.RepeatWrapping;
          t.anisotropy = aniso;
        }
        return t;
      }));
    }
    return texCache.get(file);
  };
  const own = new Map();
  await Promise.all(Object.entries(manifest.materials).map(async ([name, p]) => {
    const files = manifest.textures[p.tex] || {};
    const [map, normalMap, roughnessMap] = await Promise.all([
      tex(files.diff, true), tex(files.nor, false), tex(files.rough, false),
    ]);
    // Blender's tint multiplies the texture in linear light, as three's colour does
    const rgb = p.tex ? (p.tint || [1, 1, 1]) : p.color;
    const color = new THREE.Color().setRGB(rgb[0], rgb[1], rgb[2], THREE.LinearSRGBColorSpace);
    const m = new THREE.MeshStandardMaterial({
      name, color, map, normalMap, roughnessMap,
      roughness: roughnessMap ? p.rough_scale : p.rough,
      metalness: p.metal,
    });
    if (normalMap) m.normalScale.set(p.normal, p.normal);
    if (p.emission) {
      m.emissive.setRGB(...p.emission);
      // the bake took the full strength; on screen a glow is enough
      m.emissiveIntensity = Math.min(2.2, p.emission_strength * 0.25);
    }
    if (p.alpha < 1) {
      m.transparent = true;
      m.opacity = p.alpha;
      m.depthWrite = false;
    }
    own.set(name, m);
  }));

  // hand out materials: one instance per (material, way of being lit)
  const variants = new Map();
  const variant = (base, key, make) => {
    const k = base.uuid + '|' + key;
    if (!variants.has(k)) variants.set(k, make());
    return variants.get(k);
  };
  const byName = {};
  const baked = [];
  const live = [];
  gltf.scene.traverse((o) => {
    if (o.name) byName[o.name] = o;
    if (!o.isMesh) return;
    // a multi-material node becomes a group of meshes: the extras sit on the parent
    let src = o;
    while (src && !('lm' in src.userData) && !('lmv' in src.userData) && !('live' in src.userData) && src.parent) src = src.parent;
    const ud = src.userData || {};
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const out = mats.map((m0) => {
      const base = own.get(m0.name.split('@')[0]) || m0;
      if (ud.lmv && o.geometry.attributes.color_1) {
        return variant(base, 'vertex', () => {
          const m = base.clone();
          // the colours are light, not paint: read them ourselves
          m.vertexColors = false;
          patchBaked(m, 'vertex', manifest.vertex, null);
          return m;
        });
      }
      if (ud.lm && lm[ud.lm] && o.geometry.attributes.uv1) {
        const L = lm[ud.lm];
        return variant(base, 'lm-' + ud.lm, () => {
          const m = base.clone();
          // a baked surface has no lights to glint in; let brass take some of the bake too
          if (m.metalness > 0.5) {
            m.metalness = 0.55;
            m.roughness = Math.max(m.roughness, 0.42);
          }
          m.lightMap = L.lamp;
          patchBaked(m, 'atlas', L.scales, L.amb);
          return m;
        });
      }
      return variant(base, 'live', () => base === m0 ? m0 : base.clone());
    });
    // glass the models bring (a lens, a lamp shade) asks for transmission, which renders
    // black here: make it thin clear glass that only catches reflections
    for (const m of out) {
      if (m.transmission > 0) {
        m.transmission = 0;
        m.transparent = true;
        m.opacity = 0.14;
        m.depthWrite = false;
        m.roughness = 0.04;
        m.roughnessMap = null;
      }
    }
    o.material = Array.isArray(o.material) ? out : out[0];
    // brass that is lit live wants to reflect the room, not mirror the dark
    if (!out.some((m) => m.userData.baked)) {
      for (const m of out) {
        if (m.isMeshStandardMaterial && m.metalness > 0.9) {
          m.metalness = 0.85;
          m.roughness = Math.max(m.roughness, 0.38);
        }
      }
    }
    const isBaked = out.some((m) => m.userData.baked);
    (isBaked ? baked : live).push(o);
    o.castShadow = !isBaked;
    o.receiveShadow = !isBaked;
    // the lamp's own parts sit around its light: they must not shadow it
    if (/^lamp_/.test(src.name || o.name)) o.castShadow = false;
  });

  bindBooks(byName);
  return { root: gltf.scene, byName, baked, live, manifest, materials: [...variants.values()] };
}

// The bookcase holds five copies of one encyclopaedia (books0..books4): bind each set in
// a cloth of its own, so they read as different works. Multiplies the cover's own colour.
const CLOTHS = [[1, 1, 1], [0.42, 0.6, 0.44], [0.78, 0.36, 0.32], [0.5, 0.42, 0.36], [0.4, 0.48, 0.72]];
function bindBooks(byName) {
  CLOTHS.forEach((tint, k) => {
    const set = byName['books' + k];
    if (!set) return;
    const made = new Map();
    set.traverse((o) => {
      if (!o.isMesh || !/_cover/.test(o.material.name)) return;
      if (!made.has(o.material)) {
        const m = o.material.clone();
        // a clone does not carry the baked light's shader patch: hand it over
        m.onBeforeCompile = o.material.onBeforeCompile;
        m.customProgramCacheKey = o.material.customProgramCacheKey;
        m.color.multiply(new THREE.Color().setRGB(...tint, THREE.LinearSRGBColorSpace));
        softer(m);
        made.set(o.material, m);
      }
      o.material = made.get(o.material);
    });
  });
}

// The gilt titles on the spines are finer than a pixel from across the room: read the
// cover from a blurrier level of its mipmaps, so they do not crawl as you breathe.
const SOFTER = 1.2;
function softer(m) {
  const before = m.onBeforeCompile, key = m.customProgramCacheKey;
  m.onBeforeCompile = (shader, renderer) => {
    before.call(m, shader, renderer);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <map_fragment>', THREE.ShaderChunk.map_fragment.replace('texture2D( map, vMapUv )', `texture2D( map, vMapUv, ${SOFTER.toFixed(1)} )`))
      .replace('#include <normal_fragment_maps>', THREE.ShaderChunk.normal_fragment_maps.replace('texture2D( normalMap, vNormalMapUv )', `texture2D( normalMap, vNormalMapUv, ${SOFTER.toFixed(1)} )`));
  };
  m.customProgramCacheKey = () => key.call(m) + '|softer';
}

// A capture of the room from near the table, for reflections everywhere.
export function captureEnvironment(renderer, scene, at) {
  const rt = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType });
  const cam = new THREE.CubeCamera(0.05, 40, rt);
  cam.position.copy(at);
  scene.add(cam);
  cam.update(renderer, scene);
  scene.remove(cam);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromCubemap(rt.texture).texture;
  rt.dispose();
  pmrem.dispose();
  return env;
}

// Move an object under a new parent and bake its transform into its geometry, so
// that its own rotation starts from zero in the parent's frame.
export function adopt(obj, parent) {
  obj.updateWorldMatrix(true, true);
  parent.updateWorldMatrix(true, false);
  const m = new THREE.Matrix4().copy(parent.matrixWorld).invert().multiply(obj.matrixWorld);
  const bake = (mesh, mat) => {
    mesh.geometry = mesh.geometry.clone();
    mesh.geometry.applyMatrix4(mat);
    mesh.position.set(0, 0, 0);
    mesh.quaternion.identity();
    mesh.scale.set(1, 1, 1);
  };
  if (obj.isMesh) bake(obj, m);
  else {
    for (const c of obj.children) if (c.isMesh) bake(c, m.clone().multiply(c.matrix));
    obj.position.set(0, 0, 0);
    obj.quaternion.identity();
    obj.scale.set(1, 1, 1);
  }
  parent.add(obj);
  return obj;
}
