#version 410 core

layout(location=0) in vec3 inPosition;
layout(location=1) in vec3 inNormal;
layout(location=2) in vec2 inTexCoord;

uniform mat4 viewMat;
uniform mat4 projMat;
uniform mat4 modelMat = mat4(1);
uniform mat3 textureMat = mat3(1);
uniform mat4 shadowProjMat;
uniform mat4 shadowViewMat;
out vec3 worldPos;
out vec3 normal;
out vec2 texCoord;
out vec4 shadowCoord;
out float shadowDepth;

out vec3 cameraPos;
out vec3 cameraNormal;

void main( void ) {
	vec4 world_Pos = modelMat * vec4( inPosition, 1. );
	vec4 camera_Pos = viewMat * world_Pos;
	cameraPos = camera_Pos.xyz;
	cameraNormal = normalize((viewMat*(modelMat*vec4(inNormal,0))).xyz);
	worldPos = world_Pos.xyz;
	normal = normalize( (modelMat*vec4(inNormal,0)).xyz );
	texCoord = ( textureMat * vec3( inTexCoord, 1 ) ).xy;
	vec4 shadow_Pos = shadowViewMat * (world_Pos+vec4(normal*0.04f,0));
	shadowDepth = shadow_Pos.z;
	shadowCoord = shadowProjMat * shadow_Pos;
	gl_Position= projMat * viewMat * world_Pos;
}
