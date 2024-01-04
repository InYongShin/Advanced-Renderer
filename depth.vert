#version 410 core

layout(location=0) in vec3 inPosition;
layout(location=1) in vec3 inNormal;

uniform mat4 modelMat = mat4(1);
uniform mat4 viewMat;
uniform mat4 projMat;

out vec3 cameraPos;
out vec3 cameraNormal;

void main( void ) {
	vec4 world_Pos = modelMat * vec4( inPosition, 1. );
	vec4 camera_Pos = viewMat * world_Pos;
	cameraPos = camera_Pos.xyz;
	cameraNormal = normalize((viewMat*(modelMat*vec4(inNormal,0))).xyz);
	gl_Position = projMat * camera_Pos;
}
