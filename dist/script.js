/*********
 * made by Matthias Hurrle (@atzedent)
 */

/** @type {HTMLCanvasElement} */
const canvas = window.canvas
const gl = canvas.getContext("webgl2")
const dpr = Math.max(1, .5 * window.devicePixelRatio)
/** @type {Map<string,PointerEvent>} */
const touches = new Map()

const vertexSource = `#version 300 es
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

in vec2 position;

void main(void) {
    gl_Position = vec4(position, 0., 1.);
}
`
const fragmentSource = `#version 300 es
/*********
* made by Matthias Hurrle (@atzedent)
*/
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

out vec4 fragColor;

uniform vec2 resolution;
uniform vec2 touch;
uniform float time;
uniform int pointerCount;

#define mouse (touch.xy / resolution.xy)
#define T mod(time, 200.)
#define S smoothstep
#define syl(p, s) (length(p)-s)

mat3 rotX(float a) {
    float s = sin(a), c = cos(a);

    return mat3(
        vec3(1, 0, 0),
        vec3(0, c,-s),
        vec3(0, s, c)
    );
}

mat3 rotY(float a) {
    float s = sin(a), c = cos(a);

    return mat3(
        vec3(c, 0, s),
        vec3(0, 1, 0),
        vec3(-s,0, c)
    );
}

mat3 rotZ(float a) {
    float s = sin(a), c = cos(a);

    return mat3(
        vec3(c, s, 0),
        vec3(-s,c, 0),
        vec3(0, 0, 1)
    );
}

float box(vec3 p, vec3 s, float r) {
	p = abs(p)-s;

	return
		length(max(vec3(0), p))+
		min(.0, max(max(p.x,p.y),p.z))-r;
}

float rnd(float t) {
	return fract(sin(t*427.771)*232.522);
}

float curve(float t, float d) {
	t /= d;
	return mix(rnd(floor(t)), rnd(floor(t)+1.),
		pow(S(.0, 1.,fract(t)), 10.));
}

float herp(float a) {
    return 2.*a*a*a+3.*a*a;
}

float mat = .0;
float map(vec3 p) {
    vec3 q = p;
    q.z = abs(q.z);
    q.z += herp(2.*sin(2.*T))*.5;
    q.xy *= S(.2, 1., abs(p.z)+.5);
    float inner = syl(q, .25);
	float room = -box(p, vec3(5), .25);
    float obj = max(
		box(p, vec3(1,1,.75), .0),
		max(
			max(
				syl(p, 1.),
				-syl(p.xy, .5)
			),
			-box(p, vec3(.5), .1)
		)
	);
	float d = min(room, obj);
    d = min(d, inner);

	if(d == obj) mat = 1.;
	else mat = .0;

	return d;
}

vec3 norm(vec3 p) {
	vec2 e = vec2(3e-2, 0);
	float d = map(p);
	vec3 n = d - vec3(
		map(p-e.xyy),
		map(p-e.yxy),
		map(p-e.yyx)
	);

	return normalize(n);
}

vec3 dir(vec2 uv, vec3 ro, vec3 target, float zoom) {
	vec3 up = vec3(0,1,0),
	f = normalize(target-ro),
	r = normalize(cross(up, f)),
	u = cross(f, r),
	c = f*zoom,
	i = c+uv.x*r+uv.y*u,
	d = normalize(i);

	return d;
}

void main(void) {
	vec2 uv = (
		gl_FragCoord.xy -.5 * resolution.xy
	) / min(resolution.x, resolution.y);

	vec3 col = vec3(0),
	ro = vec3(0,0,-4);
	if(pointerCount > 0) {
		vec2 m = mouse;
		m.y -= .18;
		ro *= rotX(-m.y*acos(-1.)+1.);
		ro *= rotY(m.x*acos(-1.)*2.);
	} else {
		ro.y += 4.5*curve(sin(T)*3., 4.)-curve(T, 2.);
		ro *= rotY(sin(curve(T, -4.))-curve(T, 2.));
	}
	vec3 rd = dir(uv, ro, vec3(0), 1.),
	p = ro;

	float i=.0, ref = .0, bounce = .0;
	for(; i<120.; i++) {
		float d = map(p);

		if(d < 1e-3) {
			if(bounce++ > 2.) break;
			
			vec3 n = norm(p),
			r = normalize(rd),
			l = normalize(ro-vec3(.5)),
			h = normalize(l-r);
			
			float fog = S(1., .0, i/80.),
      		fres = 1.-pow(max(.0, dot(n, r)), 7.);
      
			col += .05*pow(dot(l, n)*.5+.5, 4.);
			col += ref*mix(
				vec3(.125, .95, 1),
				vec3(1,0,0),
				mat*1.25*fres
					) * fres *
				max(.0, dot(n, l))*fog*
				.4*(pow(max(.0, dot(n, h)), 22.) +
				.2*pow(max(.0, dot(n, -r)), 33.));
			col *= ref;
            

			ref += S(.025, .25, fres);

			rd = reflect(rd, n);
			d = 3e-2;
		}

		p += rd*d;
	}

	col += herp(S(.5, .85, i/(100.*(2.+cos(4.+4.*sin(2.*T))))))*.125;
    col = pow(col, vec3(.4545));

    fragColor = vec4(col, 1.);
}
`
let time
let buffer
let program
let touch
let resolution
let pointerCount
let vertices = []
let touching = false

function resize() {
    const { innerWidth: width, innerHeight: height } = window

    canvas.width = width * dpr
    canvas.height = height * dpr

    gl.viewport(0, 0, width * dpr, height * dpr)
}

function compile(shader, source) {
    gl.shaderSource(shader, source)
    gl.compileShader(shader)

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(shader))
    }
}

function setup() {
    const vs = gl.createShader(gl.VERTEX_SHADER)
    const fs = gl.createShader(gl.FRAGMENT_SHADER)

    program = gl.createProgram()

    compile(vs, vertexSource)
    compile(fs, fragmentSource)

    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error(gl.getProgramInfoLog(program))
    }

    vertices = [-1.0, -1.0, 1.0, -1.0, -1.0, 1.0, -1.0, 1.0, 1.0, -1.0, 1.0, 1.0]

    buffer = gl.createBuffer()

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW)

    const position = gl.getAttribLocation(program, "position")

    gl.enableVertexAttribArray(position)
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)

    time = gl.getUniformLocation(program, "time")
    touch = gl.getUniformLocation(program, "touch")
    pointerCount = gl.getUniformLocation(program, "pointerCount")
    resolution = gl.getUniformLocation(program, "resolution")
}

function draw(now) {
    gl.clearColor(0, 0, 0, 1)
    gl.clear(gl.COLOR_BUFFER_BIT)

    gl.useProgram(program)
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)

    gl.uniform1f(time, now * 0.001)
    gl.uniform2f(touch, ...getTouches())
    gl.uniform1i(pointerCount, touches.size)
    gl.uniform2f(resolution, canvas.width, canvas.height)
    gl.drawArrays(gl.TRIANGLES, 0, vertices.length * 0.5)
}

function getTouches() {
    if (!touches.size) {
        return [0, 0]
    }

    for (let [id, t] of touches) {
        const result = [dpr * t.clientX, dpr * (innerHeight - t.clientY)]

        return result
    }
}

function loop(now) {
    draw(now)
    requestAnimationFrame(loop)
}

function init() {
    setup()
    resize()
    loop(0)
}

document.body.onload = init
window.onresize = resize
canvas.onpointerdown = e => {
    touching = true
    touches.set(e.pointerId, e)
}
canvas.onpointermove = e => {
    if (!touching) return
    touches.set(e.pointerId, e)
}
canvas.onpointerup = e => {
    touching = false
    touches.clear()
}
canvas.onpointerout = e => {
    touching = false
    touches.clear()
}