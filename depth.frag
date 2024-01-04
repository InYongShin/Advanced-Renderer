
#version 410 core

in vec3 cameraPos;
in vec3 cameraNormal;

out vec4 out_Color;
uniform vec2 viewport;

void main( void ){
	out_Color = vec4(cameraPos.z, normalize(cameraNormal).xy, gl_FragCoord.z);
}