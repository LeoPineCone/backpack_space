/**
 * A turning planet for menu backgrounds, drawn from one flat surface map (2:1, left edge continues the right edge).
 * A shader wraps the map around a sphere and moves it slowly, so the loop never jumps. Light comes from the upper
 * left; the night side is ink black with a hatched band at the edge, and a black outline closes the disc
 * (dark ink comic, no glow).
 */
import { Container, Geometry, GlProgram, Mesh, Shader, Texture, UniformGroup } from "pixi.js";

const vertex = `
in vec2 aPosition;
in vec2 aUV;
out vec2 vUV;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vUV = aUV;
}`;

const fragment = `
in vec2 vUV;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform float uTurn;    // 0..1, one full turn
uniform float uTilt;    // axis tilt in radians
uniform float uPx;      // one screen pixel in disc units, for smooth edges
uniform float uHatch;   // hatch lines across the disc
const float PI = 3.14159265;
const vec3 INK = vec3(0.043, 0.051, 0.078);
void main() {
  vec2 p = vUV * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) discard;
  // axis tilt: turn the disc before looking up the surface
  float c = cos(uTilt), s = sin(uTilt);
  vec2 q = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  float z = sqrt(max(0.0, 1.0 - dot(q, q)));
  float lon = atan(q.x, z) / (2.0 * PI) + uTurn;
  float lat = asin(clamp(q.y, -1.0, 1.0)) / PI + 0.5;
  vec3 col = texture(uTexture, vec2(fract(lon), lat)).rgb;
  // light from the upper left, in screen space so the shadow stays put while the surface turns
  vec3 n = vec3(p.x, -p.y, sqrt(max(0.0, 1.0 - r * r)));
  float lam = dot(n, normalize(vec3(-0.45, 0.5, 0.6)));
  float hatch = step(0.55, fract((p.x - p.y) * uHatch));
  float night = 1.0 - smoothstep(-0.12, -0.12 + uPx * 3.0, lam);
  float band = (1.0 - smoothstep(0.12, 0.12 + uPx * 3.0, lam)) * (1.0 - night);
  col = mix(col, INK, band * hatch * 0.85);
  col = mix(col, mix(col * 0.22, INK, 0.6), night);
  // ink outline
  float edge = smoothstep(1.0 - uPx * 7.0, 1.0 - uPx * 5.0, r);
  col = mix(col, INK, edge);
  float alpha = 1.0 - smoothstep(1.0 - uPx * 1.5, 1.0, r);
  finalColor = vec4(col * alpha, alpha);
}`;

export interface PlanetView { view: Container; update(dt: number): void }

/** `secondsPerTurn`: how long one full turn takes. Origin at the planet's centre. */
export function planetView(surface: Texture, radius: number, secondsPerTurn = 150): PlanetView {
  surface.source.style.addressModeU = "repeat";
  surface.source.style.scaleMode = "linear";
  const geometry = new Geometry({
    attributes: {
      aPosition: [-radius, -radius, radius, -radius, radius, radius, -radius, radius],
      aUV: [0, 0, 1, 0, 1, 1, 0, 1],
    },
    indexBuffer: [0, 1, 2, 0, 2, 3],
  });
  const uniforms = new UniformGroup({
    uTurn: { value: 0, type: "f32" },
    uTilt: { value: 0.32, type: "f32" },
    uPx: { value: 1 / radius, type: "f32" },
    uHatch: { value: radius / 5, type: "f32" },
  });
  const shader = new Shader({ glProgram: GlProgram.from({ vertex, fragment, name: "planet" }), resources: { uTexture: surface.source, planet: uniforms } });
  const mesh = new Mesh({ geometry, shader });
  const view = new Container();
  view.addChild(mesh);
  let turn = 0;
  return {
    view,
    update(dt) {
      turn = (turn + dt / secondsPerTurn) % 1;
      uniforms.uniforms.uTurn = turn;
    },
  };
}
