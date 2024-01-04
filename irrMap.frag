#version 410 core

in vec2 texCoord;
out vec4 outColor;
uniform sampler2D ibl;

const int nSample = 100;
const float PI = 3.1415926535;


vec2 vec2Coord( vec3 r ) {
	float theta = atan( r.x, r.z );
	float phi = atan( r.y, length(r.xz) );
	return vec2(0.5, 0.5) - vec2(theta/PI/2, -phi/PI);
}
 
vec3 coord2Vec( vec2 uv ) {
	vec2 thetaPhi = (vec2(0.5,0.5)-uv) * vec2(PI*2,PI);
	return vec3( sin(thetaPhi.x)*cos(thetaPhi.y), sin(thetaPhi.y), cos(thetaPhi.x)*cos(thetaPhi.y) );
}

mat3 buildFrame( vec3 N ) {
	vec3 up = abs(N.y)<0.99 ? vec3(0,1,0) : vec3(0,0,1);
	vec3 t1 = normalize(cross(up,N));
	vec3 t2 = cross(N,t1);
	return mat3(t1,t2,N);
}

void main( void ) {
	vec3 sumL = vec3(0);
	float sumW = 0;
	vec3 N = coord2Vec( texCoord );

	for( int i=0; i<nSample; i++ ) for( int j=0; j<nSample; j++ ) {
		float theta = i/float(nSample)*PI-PI/2;
		float phi	= j/float(nSample)*2*PI-PI;
		vec3 w_i = vec3( cos(theta)*sin(phi), sin(theta), cos(theta)*cos(phi) );
		float NoL = dot( w_i, N );
		if( NoL>0 ) {
			vec2 uv = vec2( -phi/(2*PI)+0.5, theta/PI+0.5 );
			vec3 Li = texture( ibl, uv ).rgb;
			float w = cos(theta);
			sumW += w;
			sumL += Li * w * NoL;
		}
	}

	sumL /= sumW;
	outColor = vec4(sumL, 1);
}