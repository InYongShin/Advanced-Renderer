#version 410 core

in vec2 texCoord;

out vec4 outColor;

uniform sampler2D ibl;
uniform float roughness = 0.5f;

const int nSample = 100;
const float PI = 3.1415926535;


float rand( int i ){
	float d = dot(vec4(gl_FragCoord.xyz, i), vec4(12.9898f, 78.233f, 45.164f, 94.673f));
	return fract(sin(d) * 43759.5453f);
}

float VanDerCorput( int n, int base ){
	float invBase = 1.0f / float(base);
	float denom = 1.0f;
	float result = 0.0;

	for(int i=0; i<32; i++){
		if(n>0){
			denom = mod(float(n), 2.0f);
			result += denom * invBase;
			invBase = invBase / 2.0f;
			n = int(float(n) / 2.0f);
		}
	}
	return result;
}

vec2 Hammersley( int i, int n ){
	return vec2(float(i)/float(n), VanDerCorput(i, 2));
}

vec2 vec2Coord( vec3 r ) {
	float theta = atan( r.x, r.z );
	float phi = atan( r.y, length(r.xz) );
	return vec2(0.5, 0.5) - vec2(theta/PI/2, -phi/PI);
}

vec3 coord2Vec( vec2 uv ) {
	vec2 thetaPhi = (vec2(0.5,0.5)-uv) * vec2(PI*2,PI);
	return vec3( sin(thetaPhi.x)*cos(thetaPhi.y), sin(thetaPhi.y), cos(thetaPhi.x)*cos(thetaPhi.y) );
}

vec3 sampleLight( vec3 r, float lod ) {
	return texture( ibl, vec2Coord(r), lod ).rgb;
}

mat3 buildFrame( vec3 N ) {
	vec3 up = abs(N.z)<0.99 ? vec3(0,0,1) : vec3(1,0,0);
	vec3 t1 = normalize(cross(up,N));
	vec3 t2 = cross(N,t1);
	return mat3(t1,t2,N);
}

vec3 importanceSampleGGX( vec2 Xi, float roughness, mat3 TBN ) {
	float a = roughness * roughness;
	float phi = 2 * PI * Xi.x;
	float cosTheta = sqrt( (1-Xi.y)/(1+(a*a-1)*Xi.y) );
	float sinTheta = sqrt( 1-cosTheta*cosTheta );
	vec3 H = vec3( sinTheta*cos(phi), sinTheta*sin(phi), cosTheta );
	return TBN * H;
}

void main( void ) {
	vec3 sumL = vec3(0);
	float sumW = 0;
	vec3 R = coord2Vec( texCoord );
	vec3 N = R, V = R;
	mat3 frame = buildFrame( R );
	
	for( int i=0; i<nSample; i++ ) for (int j=0; j<nSample; j++) {
		// vec2 Xi = Hammersley( i, nSample );
		// vec2 Xi = vec2(VanDerCorput(i,nSample), VanDerCorput(j,nSample));
		vec2 Xi = vec2(float(i)/nSample, float(j)/nSample);
		vec3 L = importanceSampleGGX( Xi, roughness, frame );
		float NoL = dot( L, N );
		if( NoL>0 ) {
			sumL += sampleLight( L, roughness*6 ) * NoL;
			sumW += NoL;
		}
	}
	outColor = vec4(sumL/sumW, 1);
}