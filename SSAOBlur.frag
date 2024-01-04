#version 410 core

out vec4 outColor;
in vec2 texCoord;

uniform vec2 viewport;
uniform sampler2D ssaoMap;
uniform sampler2D depthMap;

uniform float sigma = 3;
uniform float ssaoRadius = 0.01;

uniform int direction = 0;

void main( void ) {
	float w_sum = 0;
	float sum = 0;
	int range = int( sigma*2+1 ); 

	float d0 = texture(depthMap, gl_FragCoord.xy/viewport).r;

	float denom = 1./(2.*sigma*sigma);
	float denom2 = 1./(2*ssaoRadius*ssaoRadius);

	if( direction > 0 ) {
		for( int y=-range; y<=range; y++ ) {
			vec2 coord = (gl_FragCoord.xy + vec2(0,y))/viewport;
			float delta = texture(depthMap, coord).r - d0;
			float w = exp( -y*y*denom ) * exp(-delta*delta*denom2);;
			sum += texture( ssaoMap, coord ).r * w;
			w_sum += w;
		}
	} else {
		for( int x=-range; x<=range; x++ ) {
			vec2 coord = (gl_FragCoord.xy + vec2(x,0))/viewport;
			float delta = texture(depthMap, coord).r - d0;
			float w = exp( -x*x*denom ) * exp(-delta*delta*denom2);
			sum += texture( ssaoMap, coord ).r * w;
			w_sum += w;
		}
	}

	outColor = vec4(vec3(sum/w_sum), 1);
}