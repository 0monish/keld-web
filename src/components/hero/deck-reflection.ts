import { Color, PlaneGeometry } from "three";
import { Reflector } from "three/addons/objects/Reflector.js";

import type { SceneConfig } from "@/components/hero/_types/scene-runtime";

/** Optional planar reflection for a polished deck, disabled for rough stone. */
export function createDeckReflection(config: SceneConfig["reflection"]) {
  if (config.enabled === false) return undefined;
  const reflector = new Reflector(new PlaneGeometry(config.width, config.depth), {
    color: 0xb5c3d2,
    textureWidth: 512,
    textureHeight: 512,
    clipBias: 0.002,
    multisample: 0,
    shader: {
      name: "KELDSatinReflection",
      uniforms: {
        color: { value: new Color(0xb5c3d2) },
        tDiffuse: { value: null },
        textureMatrix: { value: null },
        strength: { value: 0.24 },
      },
      vertexShader: `
      uniform mat4 textureMatrix;
      varying vec4 reflectionUv;
      void main() {
        reflectionUv = textureMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
      fragmentShader: `
      uniform vec3 color;
      uniform sampler2D tDiffuse;
      uniform float strength;
      varying vec4 reflectionUv;
      void main() {
        vec4 reflected = texture2DProj(tDiffuse, reflectionUv);
        gl_FragColor = vec4(reflected.rgb * color, strength);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    },
  });
  reflector.name = "BrowserDeckReflection";
  reflector.position.fromArray(config.position);
  reflector.rotation.x = -Math.PI / 2;
  const reflectionMaterials = Array.isArray(reflector.material)
    ? reflector.material
    : [reflector.material];
  reflectionMaterials.forEach((material) => {
    material.transparent = true;
    material.depthWrite = false;
  });
  reflector.renderOrder = 1;
  return reflector;
}
