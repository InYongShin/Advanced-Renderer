#version 410 core

in vec2 texCoord;

out vec4 outColor;

// const float E = 0.000001f;
const int nSample = 100;
const float PI = 3.1415926535;

uniform float eta;
uniform float ext;



float ShlickGeometry( vec3 v, vec3 N, float roughness ) {
	//float cosTheta = clamp(dot(N,v), E, 1);
	float cosTheta = dot(N,v);
	float alpha = roughness * roughness;
	float k = sqrt( (2*alpha)/PI );
	return cosTheta/(cosTheta*(1-k)+k);
}

float SmithGeometry( vec3 w_i, vec3 w_o, vec3 N, float roughness ) {
	return ShlickGeometry(w_i, N, roughness) * ShlickGeometry(w_o, N, roughness);
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

vec3 importanceSampleGGX( vec2 Xi, float roughness, mat3 TBN ) {
	float a = roughness * roughness;
	float phi = 2 * PI * Xi.x;
	float cosTheta = sqrt( (1-Xi.y)/(1+(a*a-1)*Xi.y) );
	float sinTheta = sqrt( 1-cosTheta*cosTheta );
	vec3 H = vec3( sinTheta*cos(phi), sinTheta*sin(phi), cosTheta );
	return TBN * H;
}

mat3 buildFrame( vec3 N ) {
	vec3 up = abs(N.y)<0.99 ? vec3(0,1,0) : vec3(1,0,0);
	vec3 t1 = normalize(cross(up,N));
	vec3 t2 = cross(N,t1);
	return mat3(t1,t2,N);
}


void main( void ) {
	vec3 N = vec3(0,0,1);
	float NoV = texCoord.y;
	float roughness = texCoord.x;
	vec3 sumL = vec3(0);
	float sumW = 0;
	vec3 V = vec3(sqrt(1-NoV*NoV),0,NoV);
	mat3 frame = buildFrame( N );

	float eta2 = eta*eta;
	float ext2 = ext*ext;


	for( int i=0; i<nSample; i++ ) for( int j=0; j<nSample; j++ ) {
		// vec2 Xi = Hammersley(i, nSample);
		// vec2 Xi = vec2(VanDerCorput(i,nSample), VanDerCorput(j,nSample));
		vec2 Xi = vec2(float(i)/nSample, float(j)/nSample);
		vec3 H = importanceSampleGGX( Xi, roughness, frame );
		vec3 L = 2 * dot(V,H)*H - V;
		float NoL = L.z;
		if( NoL>0 ) {
			float VoH = dot(V,H);
			float cos2 = NoV * NoV;
			float etaCos = 2 * eta * NoV;
			float f_1 = (eta2+ext2-etaCos+cos2)/(eta2+ext2+etaCos+cos2);
			float f_2 = ((eta2+ext2)*cos2-etaCos+1)/((eta2+ext2)*cos2+etaCos+1);
			float f = 0.5 * (f_1 + f_2);

			float G = SmithGeometry(L,V,N,roughness);
			float G_Vis = G/(4*NoV);
			float Fc = max(0, pow(1-VoH,5));
			// float denorm = clamp(dot(w_o,N),0.01,1.0);
			sumL += vec3( 1-Fc, Fc, f ) * G_Vis;
			sumW += 1;
		}
	}
	outColor = vec4(sumW>0?sumL/sumW : vec3(0), 1);
}