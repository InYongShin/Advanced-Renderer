
#version 410 core

out vec4 outColor;
in vec2 texCoord;

uniform vec2 viewport;
uniform sampler2D depthMap;
uniform float ssaoRadius = 0.0125;
uniform float ssaoBias = 0.001;
uniform mat4 projMat;

const float PI = 3.1415926535;

const vec3 ssaoSamples[64] = vec3[64](
vec3(-0.640441,0.132779,0.001306),vec3(-0.365055,-0.049078,0.713254),vec3(-0.414618,0.313745,0.523432),vec3(-0.000108,0.000007,0.000196),vec3(-0.025504,-0.009802,0.003305),vec3(-0.000013,-0.000002,0.000017),vec3(0.081831,-0.315612,0.011516),vec3(-0.317626,0.101984,0.286333),
vec3(-0.315456,-0.105311,0.160515),vec3(0.003660,0.055699,0.072090),vec3(0.581716,0.289232,0.558857),vec3(-0.004671,-0.044061,0.033222),vec3(0.337219,-0.350173,0.519858),vec3(0.024033,0.107705,0.107426),vec3(0.000459,-0.000274,0.000180),vec3(0.001161,-0.002669,0.001231),
vec3(-0.035137,0.065659,0.000689),vec3(0.366066,0.207297,0.318730),vec3(0.118134,-0.142806,0.117520),vec3(0.005115,0.009399,0.004792),vec3(0.219171,-0.107031,0.279340),vec3(-0.037427,-0.014894,0.030742),vec3(0.045258,0.801360,0.562433),vec3(-0.272907,-0.127327,0.309806),
vec3(0.094382,-0.206219,0.116206),vec3(-0.506545,0.635375,0.104225),vec3(-0.000898,-0.002407,0.004234),vec3(-0.428760,0.226502,0.597585),vec3(-0.018770,0.004990,0.024985),vec3(-0.163496,-0.011741,0.193946),vec3(-0.162946,-0.069792,0.270573),vec3(0.104290,0.120239,0.160311),
vec3(0.001129,-0.000446,0.000208),vec3(-0.002572,0.005681,0.009010),vec3(0.009316,0.079231,0.089250),vec3(0.079582,-0.028674,0.054097),vec3(0.073750,-0.034832,0.034823),vec3(-0.364610,0.080689,0.443267),vec3(0.001651,-0.187715,0.769835),vec3(0.000370,0.002523,0.000070),
vec3(0.253828,-0.226369,0.196573),vec3(0.009250,-0.008169,0.008889),vec3(-0.529520,0.692396,0.156531),vec3(-0.459959,-0.209289,0.182891),vec3(0.117347,0.243501,0.488539),vec3(-0.002967,-0.002117,0.000752),vec3(-0.006354,0.007741,0.008849),vec3(-0.117432,-0.147691,0.084101),
vec3(0.000562,0.002409,0.004867),vec3(0.039541,-0.060063,0.044003),vec3(0.062387,-0.214376,0.174936),vec3(0.008285,-0.680796,0.629772),vec3(-0.055495,0.076033,0.062265),vec3(-0.083949,0.976780,0.175905),vec3(-0.181889,0.056132,0.021863),vec3(0.043712,-0.050020,0.051592),
vec3(-0.011924,0.035936,0.015179),vec3(-0.031472,0.067738,0.204257),vec3(0.504470,0.191560,0.425017),vec3(0.023835,0.080078,0.113239),vec3(0.173029,0.746664,0.289164),vec3(0.146007,-0.433680,0.169302),vec3(-0.000109,-0.002930,0.005759),vec3(0.141889,0.132069,0.436549));

float rand(){
	float d = dot(gl_FragCoord.xy, vec2(12.9898f, 78.233f));
	return fract(sin(d) * 43759.5453f);
}

float ssao( vec3 N, vec3 p, float r, float bias ) {
	float angle = rand() * 2 * PI;
	vec3 up = abs(N.y)<0.99 ? vec3(0,cos(angle),sin(angle)) : vec3(sin(angle),0,cos(angle));

	vec3 t1 = normalize( cross(up,N) );
	vec3 t2 = cross( N, t1 );
	mat3 TBN = mat3(t1,t2,N);
	float occlusion = 0.0f;
	for(int i=0; i<32; i++){
		vec3 samplePos = TBN * ssaoSamples[i];
		samplePos = p + samplePos * r;

		vec4 offset = projMat * vec4(samplePos, 1.0);
		offset.xyz /= offset.w;
		float sampleDepth = texture(depthMap, offset.xy*.5+.5).r;
		float rangeCheck = smoothstep(0.0, 1.0, r/abs(p.z-sampleDepth));
		occlusion += (sampleDepth >= samplePos.z + bias ? 1.0 : 0.0) * rangeCheck;
	}
	return 1-occlusion/32;
}

void main( void ) {
	vec4 vv = texture( depthMap, vec2(texCoord.x, 1-texCoord.y) );
	vec3 camNorm = vec3(vv.yz, sqrt(1-dot(vv.yz,vv.yz)));

	vec4 cc = inverse(projMat) * vec4(gl_FragCoord.xy/viewport*2.-1., vv.a*2.-1., 1);
	vec3 camPos = cc.xyz/cc.w;
	float ao = ssao( normalize(camNorm), camPos, ssaoRadius, ssaoBias);
	 
	outColor = vec4(vec3(ao),1);
}