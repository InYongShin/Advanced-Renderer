#version 410 core

const float E = 0.000001f;
const float PI = 3.1415926535;
const float GOLDEN_ANGLE = 2.39996;
uniform int numSample = 10;

out vec4 outColor;

in vec3 normal;
in vec3 worldPos;
in vec2 texCoord;
in vec3 cameraPos;
in vec3 cameraNormal;
in vec4 shadowCoord;
in float shadowDepth;

uniform mat4 shadowViewMat;

uniform sampler2D shadowMap;
uniform vec2 shadowMapSize;
uniform float lightSize = 1;

uniform sampler2D ssaoMap;
uniform float aoStrength = 1.0;

uniform int Pass = 0;

uniform vec2 viewport;
uniform sampler2D diffTex;
uniform sampler2D normTex;
uniform sampler2D dispTex;
uniform int  diffTexEnabled=0;
uniform int  normTexEnabled=0;
uniform int  dispTexEnabled=0;
uniform vec3 lightColor;
uniform vec3 lightPosition;
uniform float lightFactor;
uniform vec3 cameraPosition;

uniform vec3 lightDirection;

uniform float iblFactor;

uniform vec3 eta;
uniform vec3 ext;
uniform float roughness;
uniform vec4 albedo = vec4(1,1,1,1);
uniform vec3 F0 = vec3(0.04);
uniform float metalic;

uniform float alphaCutOff;

// Ambient
uniform vec3 La;
uniform float ambientFactor;

uniform sampler2D ibl;
uniform sampler2D irrMap;
uniform sampler2D envMap;
uniform sampler2D envBRDF;

//***************************************************
//            Color Space Conversion Functions
//***************************************************
float tonemap_sRGB(float u) {
	float u_ = abs(u);
	return  u_>0.0031308?( sign(u)*1.055*pow( u_,0.41667)-0.055):(12.92*u);
}
vec3 tonemap( vec3 rgb, mat3 csc, float gamma ){
	vec3 rgb_ = csc*rgb;
	if( abs( gamma-2.4) <0.01 ) // sRGB
		return vec3( tonemap_sRGB(rgb_.r), tonemap_sRGB(rgb_.g), tonemap_sRGB(rgb_.b) );
	return sign(rgb_)*pow( abs(rgb_), vec3(1./gamma) );
} x c
float inverseTonemap_sRGB(float u) {
	float u_ = abs(u);
	return u_>0.04045?(sign(u)*pow((u_+0.055)/1.055,2.4)):(u/12.92);
}
vec3 inverseTonemap( vec3 rgb, mat3 csc, float gamma ){
	if( abs( gamma-2.4) <0.01 ) // sRGB
		return csc*vec3( inverseTonemap_sRGB(rgb.r), inverseTonemap_sRGB(rgb.g), inverseTonemap_sRGB(rgb.b) );
	return csc*sign(rgb)*pow( abs(rgb), vec3(gamma) );
}


vec3 FresnelSchlick( float cosTheta, vec3 F0 ) {
	return F0 + (1-F0)*pow((1-cosTheta),5);
}

vec3 computeF0( vec3 eta1, vec3 eta2 ) {
	return pow(abs(eta1-eta2)/(eta1+eta2),vec3(2));
}

//***************************************************
//					Distribution
//***************************************************
float BlinnPhongDistribute( float cosTheta, float roughness ) {
	float alpha2 = clamp( pow(roughness,4), E , 1-E);
	float k = 2/alpha2 - 2;
	return 1/PI/alpha2*pow(cosTheta, k);
}

float GGX( float cosTheta_, float roughness ) {
	float alpha2 = pow(roughness, 4);
	float cosTheta = clamp( cosTheta_, E, 1.0f );
	float theta = acos(cosTheta);
	float tanTheta = tan(theta);
	return alpha2/(PI*pow(cosTheta,4) * pow(alpha2+pow(tanTheta,2),2));
}

//***************************************************
//					Geometry
//***************************************************
float CookTorranceGeometry( vec3 w_i, vec3 w_o, vec3 N, vec3 H ) {
	float t1 = 2*dot(N,H)*dot(N,w_o) / clamp(dot(w_o, H),E,1);
	float t2 = 2*dot(N,H)*dot(N,w_i) / clamp(dot(w_o, H),E,1);
	return min(1, min(t1, t2));
}

float ShlickGeometry( vec3 v, vec3 N, float roughness ) {
	float cosTheta = clamp(dot(N,v), E, 1);
	float alpha = roughness * roughness;
	float k = sqrt( (2*alpha)/PI );
	return cosTheta/(cosTheta*(1-k)+k);
}

float SmithGeometry( vec3 w_i, vec3 w_o, vec3 N, float roughness ) {
	return ShlickGeometry(w_i, N, roughness) * ShlickGeometry(w_o, N, roughness);
}

//***************************************************
//					  Diffuse
//***************************************************
vec3 Lambertian( vec3 w_i, vec3 w_o, vec3 N, vec3 albedo, float roughness ) {
	return albedo/PI;
}

vec3 OrenNayar( vec3 w_i, vec3 w_o, vec3 N, vec3 albedo, float roughness ) {
	float s2 = roughness*roughness;
	float A = 1 - s2/(2*(s2+0.33));
	float B = 0.45*s2/(s2+0.09);
	float theta_i = acos( dot(w_i,N) );
	float theta_o = acos( dot(w_o,N) );
	float cos_phi = dot( normalize( w_i - dot(w_i,N)*N ), normalize( w_o - dot(w_o,N)*N ) );
	return albedo/PI*(A+B*max(0,cos_phi)*sin(max(theta_i,theta_o))*abs(tan(min(theta_i,theta_o))));
}

//***************************************************
//					  BRDF
//***************************************************
mat3 getTBN( vec3 N ) {
	vec3 Q1 = dFdx(worldPos), Q2 = dFdy(worldPos);
	vec2 st1 = dFdx(texCoord), st2 = dFdy(texCoord);
	float D = st1.s*st2.t-st2.s*st1.t;
	return mat3(normalize(( Q1*st2.t - Q2*st1.t )*D),
				-normalize((-Q1*st2.s + Q2*st1.s )*D), N);
}

vec2 vec2Coord( vec3 r ) {
	float phi = atan( r.x, r.z );
	float theta = atan( r.y, length(r.xz) );
	return vec2(-phi/PI/2+0.5, theta/PI+0.5);
}

vec3 coord2Vec( vec2 uv ) {
	vec2 phiTheta = (vec2(0.5,0.5)-uv) * vec2(PI*2,-PI);
	return vec3( sin(phiTheta.x)*cos(phiTheta.y), sin(phiTheta.y), cos(phiTheta.x)*cos(phiTheta.y) );
}

vec3 sampleLight( vec3 r ) {
	return texture( ibl, vec2Coord(r) ).rgb;
}

vec3 sampleLight( vec3 r, float lod ) {
	return textureLod( ibl, vec2Coord(r), lod ).rgb;
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

vec2 VogelDiskSample(int k, int n, float offset){
	float r = sqrt(float(k)+0.5) / sqrt(float(n));
	float theta = float(k) * GOLDEN_ANGLE + offset;
	return r * vec2(cos(theta),sin(theta) );
}

float rand(){
	float d = dot(gl_FragCoord.xy, vec2(12.9898f, 78.233f));
	return fract(sin(d) * 43759.5453f);
}


vec3 specularIBL( vec3 N, vec3 V, vec4 abd, float roughness, float metalic ){
	vec3 r = N * dot(N,V)*2 - V;
	float NoV = max(dot(V,N),0);
	vec3 envBRDFsample = texture( envBRDF, vec2(roughness, 1-NoV)).xyz;
	// float rr = clamp(roughness, 0.5/32, 1-0.5/32);
	// spec = texture(envMap, vec3(vec2Coord(r),rr)).rgb*lightFactor;
	vec3 DD = mix( F0*envBRDFsample.x+envBRDFsample.y, abd.xyz*envBRDFsample.z, metalic );
	return texture(envMap, vec2(vec2Coord(r))).rgb * DD;
}

vec3 diffIBL( vec4 abd, vec3 N, float metalic ){
	vec3 diff = vec3(0);
	diff = abd.rgb/PI * texture(irrMap, vec2Coord(N)).rgb;
	diff *= 1 - metalic;
	return diff;
}

vec3 diffusePoint( vec3 N, vec3 L, vec3 V, vec3 abd, float roughness, float metalic ){
	return abd/PI * max(0, 1-metalic);
}

vec3 specularPoint( vec3 N, vec3 L, vec3 V, vec3 abd, float roughness, float metalic, vec3 eta, vec3 ext){
	vec3 eta2 = eta*eta;
	vec3 ext2 = ext*ext;

	vec3 H = normalize( V + L );
	float D = GGX(dot(H,N), roughness);
	vec3 F = FresnelSchlick( clamp(dot(H,N),0,1), F0 );

	float cosTheta = dot(H,N);
	float cos2 = cosTheta * cosTheta;
	vec3 etaCos = 2 * eta * cosTheta;
	vec3 F_1 = (eta2 + ext2 - etaCos + cos2) / (eta2 + ext2 + etaCos + cos2);
	vec3 F_2 = ((eta2+ext2)*cos2 - etaCos+1) / ((eta2+ext2)*cos2 + etaCos+1);
	F = mix(F, (F_1+F_2)*0.5f, metalic);
	float G = SmithGeometry(L,V,N,roughness);
	// float G = CookTorranceGeometry(L,V,N,H);
	float denorm = max(dot(V,N),0.01);
	return max(vec3(0), D*G*F *.25f/denorm);
}

vec3 diffuseAmbient( vec3 N, vec3 V, vec3 abd, float roughness, float metalic ){
	return abd * (1-metalic);
}

vec3 specularAmbient( vec3 N, vec3 V, vec3 abd, float roughness, float metalic ){
	float NoV = max(0, dot(V,N));
	vec3 envBRDFsample = texture( envBRDF, vec2(roughness, 1-NoV) ).xyz;
	return mix((F0*envBRDFsample.x + envBRDFsample.y), abd*envBRDFsample.z, metalic);
}

float PCF( sampler2D shadowMap, vec2 shadowUV, float shadowDepth, float radius ) {
	float r_offset = rand()*2*PI;
	float shadowFactor = 1;
	
	for(int k=0; k<64; k++){
		if( texture(shadowMap, shadowUV + VogelDiskSample(k, 64, r_offset) * radius).r > shadowDepth ) {
			shadowFactor -= 1/64.f;
		}
	}
	return shadowFactor;
}

float PCSS( sampler2D shadowMap, vec2 shadowUV, float shadowDepth, float lightSize ){
	float depthSum = 0;
	float numBlockers = 0;

	float r_offset = rand()*2*PI;
	for(int k=0; k<4; k++){
		float dd = texture(shadowMap, shadowUV + VogelDiskSample(k, 4, r_offset) * 0.01*lightSize).r;
		if( dd > shadowDepth ) {
			depthSum += dd;
			numBlockers += 1;
		}
	}
	if( numBlockers<1 ) return 1;
	float blockerDepth = depthSum/numBlockers;
	float w_penumbra = (-shadowDepth + blockerDepth) * lightSize / -blockerDepth;
	return PCF(shadowMap, shadowUV, shadowDepth, w_penumbra * 0.01f);
}


void main( void ) {
	float ao = 1-(1-texture(ssaoMap, gl_FragCoord.xy/viewport).r)*aoStrength;
	vec3 faceN = normalize( cross( dFdx(worldPos), dFdy(worldPos) ) );
	vec3 N = normalize(normal);
	
	vec3 w_o = normalize( cameraPosition - worldPos );

	mat3 TBN = getTBN( N );
	vec2 tCoord = texCoord;

	if( dispTexEnabled>0 ) {
		float dhdu = (texture(dispTex,texCoord+vec2(0.0001,0)).r-texture(dispTex,texCoord-vec2(0.0001,0)).r)*5000;
		float dhdv = (texture(dispTex,texCoord+vec2(0,0.0001)).r-texture(dispTex,texCoord-vec2(0,0.0001)).r)*5000;
		N = normalize( TBN * vec3(-dhdu*0.001, -dhdv*0.001, 1) );
	}
	else if( normTexEnabled>0 ) {
		vec3 normalOffset = texture( normTex, tCoord ).rgb * 2 - 1;
		N = normalize( TBN * normalOffset );
	}

	vec4 abd = albedo;
	if( diffTexEnabled>0 )
		abd = texture( diffTex, tCoord );
	
	vec3 toLight = lightPosition-worldPos;
	vec3 w_i = normalize( toLight );
	
	vec3 diff = diffIBL(abd, N, metalic) * iblFactor * ao;
	vec3 spec = specularIBL(N, w_o, abd, roughness, metalic) * iblFactor * ao;
	
	float spotFactor = smoothstep( 0.9, 0.95, dot(lightDirection, w_i));

	float shadowFactor = 1.;
	if(spotFactor>0) {
		vec2 shadowUV = (shadowCoord.xy / shadowCoord.w)*0.5f + 0.5f;
		float shadowFactor = PCSS(shadowMap, shadowUV, shadowDepth, lightSize);
		
//		if(texture(shadowMap, shadowUV).r > shadowDepth)
//			shadowFactor = 0;

		vec3 Li = lightColor / dot(toLight, toLight) * lightFactor * max(dot(N,w_i), 0) * shadowFactor;

		diff += diffusePoint(N, w_i, w_o, abd.rgb, roughness, metalic) * Li;
		spec += specularPoint(N, w_i, w_o, abd.rgb, roughness, metalic, eta, ext) * Li;
	}
	
	diff += diffuseAmbient(N, w_o, abd.rgb, roughness, metalic ) * La * ao;
	spec += specularAmbient(N, w_o, abd.rgb, roughness, metalic ) * La * ao;
	
	// outColor = vec4(tonemap(spec+diff, mat3(1), 2.4), abd.a);
	outColor = vec4(tonemap((spec+diff)*shadowFactor, mat3(1), 2.4), abd.a);
}