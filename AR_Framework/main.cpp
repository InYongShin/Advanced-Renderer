//
//  main.cpp
//  AR_Framework
//
//  Created by Hyun Joon Shin on 2021/09/06.
//

#define NANOUI_IMPLEMENTATION

#include <iostream>
#include "Renderer.hpp"
#include "FileLoader.hpp"
#include "Light.hpp"
#include "FrameBuffer.hpp"
#include <GLFW/glfw3.h>
#include <glm/gtx/transform.hpp>
#include <glm/gtc/type_ptr.hpp>
#pragma comment (lib, "glfw3")


AutoLoadProgram renderProg("render.vert","render.frag");
AutoLoadProgram irradianceMapProg("blit.vert","irrMap.frag");
AutoLoadProgram envMapProg("blit.vert","envMap.frag");
AutoLoadProgram envBRDFProg("blit.vert","envBRDF.frag");
AutoLoadProgram depthProg("depth.vert", "depth.frag");
AutoLoadProgram ssaoProg("blit.vert", "ssao.frag");
AutoLoadProgram ssaoBlurProg("blit.vert", "SSAOBlur.frag");

MeshSet meshSet;
TextureLib texLib;
Range3 range;
Renderer* renderer = nullptr;
Light light;

Framebuffer irrMap;
Framebuffer envMapFB;
Framebuffer envBRDF;
Framebuffer shadowMap;
Framebuffer depthMap;
Framebuffer ssaoInit;
Framebuffer ssaoMap;
Framebuffer ssaoTemp;

Texture ibl;
Texture envMap;

int numSample = 10;

float roughness = 0.5f;
float lightFactor = 1.f;
float ambientFactor = 0.2f;
float shininess = 100.0f;
float lightSize = 1.f;

float ssaoRadius = 0.05;
float ssaoStrength = 1.0f;
float blurSigma = 2.0f;

float iblFactor = 1.f;

float metalic = 0;
int metalType = 0;
int bBlinnPhong = 1;
int bGGX = 0;
int bCookTorranceGeometry = 1;
int bSmithGeometry = 0;

vec3 sceneSize;
vec3 sceneCenter;

const int envMapWidth = 256;
const int envMapHeight = 128;
// const int envMapDepth = 32;

const int brdfMapWidth = 128;
const int brdfMapHeight = 128;


struct MetalProperty {
	glm::vec3 eta;
	glm::vec3 ext;
	MetalProperty(const glm::vec3& _eta, const glm::vec3& _ext)
		: eta(_eta), ext(_ext) {}
};
const MetalProperty metalLib[] = {
	MetalProperty(glm::vec3(0.22568, 0.59188, 1.4174),	glm::vec3(3.1919, 2.1364, 1.9322)),	// Au
	MetalProperty(glm::vec3(0.22568, 0.59188, 1.4174),	glm::vec3(3.1919, 2.1364, 1.9322)),	// Ag
	MetalProperty(glm::vec3(0.37839,1.1563,1.2453),		glm::vec3(3.1068,2.6034,2.3478)),	// Cu
	MetalProperty(glm::vec3(2.8920, 2.8729, 2.5295),	glm::vec3(3.038, 2.9129, 2.737)),	// Fe
	MetalProperty(glm::vec3(1.3143,0.90906,0.59969),	glm::vec3(7.2957,6.3387,5.3328)),	// Al
	MetalProperty(glm::vec3(0.339,0.7025,1.002),		glm::vec3(3.046,2.2365,1.897)),		// Cu-Zn
	MetalProperty(glm::vec3(2.178,1.9814,1.7015),		glm::vec3(4.08,3.7,3.2195)),		// Co
	MetalProperty(glm::vec3(3.18 ,2.9743 ,2.253),		glm::vec3(3.3,3.33,2.085)),			// Cr
	MetalProperty(glm::vec3(1.859 ,1.4258,1.0147),		glm::vec3(5.0793,4.4677,3.7769)),	// Hg
	MetalProperty(glm::vec3(0.37251,0.29105,0.20959),	glm::vec3(5.6403,4.7846,3.9288)),	// Mg
	MetalProperty(glm::vec3(0.99107,0.57976,0.37147),	glm::vec3(6.1917,5.3485,4.3665)),	// Pb
	MetalProperty(glm::vec3(0.46156,0.48703,0.69668),	glm::vec3(5.8526,4.7786,3.6023)),	// Pt
	MetalProperty(glm::vec3(0.1027,0.098328,0.01019),	glm::vec3(1.4137,1.128,0.79145)),	// Rb
	MetalProperty(glm::vec3(0.25631,0.3247,0.58997),	glm::vec3(4.8615,3.9257,2.9195)),	// Ti
	MetalProperty(glm::vec3(1.1063,0.86301,0.6573),		glm::vec3(5.5213,6.3387,3.9102)),	// Zn
};

void loadFile( const std::string& fn, bool clearPrev=true ) {
	if( clearPrev ) {
		meshSet.clear();
		texLib.clear();
		range = Range3();
	}
	range += loadMesh( backToFrontSlash(fn), meshSet, texLib);
	printf("Range: %f %f\n", range.minVal.z, range.maxVal.z);
	renderer->setSceneBound(range.minVal, range.maxVal);
	sceneSize = (range.maxVal - range.minVal);
	sceneCenter = (range.maxVal + range.minVal)/2.f;
	light.position= sceneCenter + length(sceneSize)*2.f*normalize(vec3(0.5,0.7,1));
	light.color = powf(length(sceneSize)*2.f,2.f)*vec3(1);
	meshSet.push_back(TriMesh());
	meshSet.back().createQuad();
	meshSet.back().modelMat = translate(vec3(0, -sceneSize.y / 2, 0))
							* translate(sceneCenter)
							* scale(vec3(length(sceneSize) * 10.f))
							* rotate(PI / 2, vec3(-1, 0, 0));
}


void cookEnvMap(float roughness, int w, int h, Framebuffer& map) {
	map.create(w, h, GL_FLOAT, 3, false);
	map.use();
	envMapProg.use();
	ibl.bind(7, envMapProg, "ibl");
	envMapProg.setUniform("roughness", roughness);
	TriMesh::renderQuad(envMapProg);
	map.unuse();
}

void cookEnvMap( int w, int h, Framebuffer& map ) {
	map.create(w, h, GL_FLOAT, 3, false);
	map.use();
	envMapProg.use();
	ibl.bind(7, envMapProg, "ibl");
	envMapProg.setUniform("roughness", roughness);
	TriMesh::renderQuad(envMapProg);
	map.unuse();
}

void updateEnvMap( int w, int h, Texture& map, Framebuffer& mapFB ) {
	float* data = nullptr;
	cookEnvMap(w, h, mapFB);
	if (!data)
		data = mapFB.readPixels<float>();
	else
		mapFB.readPixels(data);
	map.update(data);
	delete data;
}

void loadHDR( const std::string& fn ) {
	ibl.wrap_s = GL_REPEAT;
	ibl.wrap_t = GL_CLAMP_TO_EDGE;
	ibl.load(fn);
	irrMap.create(512, 256, GL_FLOAT, 4, false);
	irrMap.use();
	irradianceMapProg.use();
	ibl.bind(7, irradianceMapProg, "ibl");
	TriMesh::renderQuad(irradianceMapProg);
	irrMap.unuse();

	envMap.wrap_s = GL_REPEAT;
	envMap.wrap_t = GL_MIRRORED_REPEAT;
	// envMap.wrap_r = GL_CLAMP_TO_EDGE;
	// envMap.create(envMapWidth, envMapHeight, envMapDepth, 3, GL_FLOAT, nullptr, false);
	envMap.create(envMapWidth, envMapHeight, 3, GL_FLOAT, nullptr, false);  
	envMap.createGL();
	glBindTexture(GL_TEXTURE_2D, envMap.texID);
	glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
	glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);

	updateEnvMap(envMapWidth, envMapHeight, envMap, envMapFB);
}


void initFunc( void ) {
	// renderer->ui->add(new nanoSliderI(0, 0, 200, "Num Sample", 1, 100, numSample));
	renderer->ui->add(new nanoSliderF(0, 0, 200, "Is Metal", 0, 1, metalic));
	renderer->ui->add(new nanoSliderF(0, 0, 200, "Roughness", 0, 1, roughness));
	renderer->ui->add(new nanoSliderF(0, 0, 200, "Light Int.", 0, 3, lightFactor));
	renderer->ui->add(new nanoSliderI(0, 0, 200, "Metal Type", 0, 14, metalType));
	renderer->ui->add(new nanoSliderF(0, 0, 200, "lightSize", 0, 8, lightSize));
	renderer->ui->add(new nanoSliderF(0, 0, 200, "iblFactor", 0, 1000, iblFactor));
	renderer->ui->add(new nanoSliderF(0, 0, 200, "SSAO R", 0, 0.1, ssaoRadius));
	renderer->ui->add(new nanoSliderF(0, 0, 200, "SSAO S", 0, 5.0, ssaoStrength));
	renderer->ui->add(new nanoSliderF(0, 0, 200, "Gauss sigma", 0.0001, 5.0, blurSigma));

	// renderer->ui->add(new nanoSliderF(0, 0, 200, "Ambient Factor", 0, 1, ambientFactor));
	
	envBRDF.wrap_t = GL_CLAMP_TO_EDGE;
	envBRDF.wrap_s = GL_CLAMP_TO_EDGE;
	envBRDF.create(brdfMapWidth, brdfMapHeight, GL_FLOAT, 3, false);
	envBRDF.use();
	envBRDFProg.use();
	envBRDFProg.setUniform("eta", metalLib[metalType].eta);	// Au
	envBRDFProg.setUniform("ext", metalLib[metalType].ext);	// Au
	TriMesh::renderQuad(envBRDFProg);
	envBRDF.unuse();

	loadFile("bunny.obj");
	loadHDR("spaichingen_hill_4k.hdr");
}

void cookEnvMapByChangeRough() {
	static float rough = roughness;
	if (rough != roughness) {
		rough = roughness;
		updateEnvMap(envMapWidth, envMapHeight, envMap, envMapFB);
	}
}

void renderGeom( Program& prog ) {
	for (auto& mesh : meshSet) {
		int textureID = mesh.material.diffTexID;
		if (textureID >= 0) {
			Texture& tex = texLib[textureID];
			tex.bind(0, prog, "diffTex");
			prog.setUniform("diffTexEnabled", 1);
		}
		else {
			prog.setUniform("albedo", mesh.material.diffColor);
			prog.setUniform("diffTexEnabled", 0);
		}

		int normTextureID = mesh.material.normMapID;
		if (normTextureID >= 0) {
			Texture& tex = texLib[normTextureID];
			tex.bind(1, prog, "normTex");
			prog.setUniform("normTexEnabled", 1);
		}
		else prog.setUniform("normTexEnabled", 0);

		int dispTextureID = mesh.material.bumpMapID;
		if (dispTextureID >= 0) {
			Texture& tex = texLib[dispTextureID];
			tex.bind(2, prog, "dispTex");
			prog.setUniform("dispTexEnabled", 1);
		}
		else prog.setUniform("distTexEnabled", 0);

		//prog.setUniform( "roughness", mesh.material.roughness);
		prog.setUniform("roughness", roughness);
		prog.setUniform("eta", metalLib[metalType].eta);	// Au
		prog.setUniform("ext", metalLib[metalType].ext);	// Au

		prog.setUniform("lightSize", lightSize);
		prog.setUniform("lightDirection", normalize(light.position-sceneCenter));

		prog.setUniform("numSample", numSample);

		prog.setUniform("metalic", metalic);

		mesh.render(prog);
	}
}

void renderFunc( Program& prog ) {
	cookEnvMapByChangeRough();

	int w = renderer->camera.viewport.x, h = renderer->camera.viewport.y;

	glEnable(GL_CULL_FACE);

	glDisable(GL_BLEND);
	shadowMap.create(4096, 4096, GL_FLOAT, 3, true);
	shadowMap.use();

	glClear(GL_DEPTH_BUFFER_BIT | GL_COLOR_BUFFER_BIT);

	depthProg.use();
	mat4 viewMat = glm::lookAt( light.position, sceneCenter, vec3(0,1,0) );
	mat4 projMat = glm::perspective(PI/2, 1.f, length(sceneSize) * 0.5f, length(sceneSize) * 20.f);
	depthProg.setUniform("viewport", vec2(shadowMap.width, shadowMap.height));
	depthProg.setUniform("viewMat", viewMat);
	depthProg.setUniform("projMat", projMat);
	renderGeom(depthProg);
	shadowMap.unuse();

	depthMap.create(w, h, GL_FLOAT, 4, true);
	depthMap.use();
	glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);
	depthProg.setUniform("viewport", renderer->camera.viewport); 
	depthProg.setUniform("viewMat", renderer->camera.viewMat());
	depthProg.setUniform("projMat", renderer->camera.projMat());
	renderGeom(depthProg);
	depthMap.unuse();
	glEnable(GL_BLEND);

	ssaoInit.create(w/2, h/2, GL_FLOAT, 4, true);
	ssaoInit.use();
	glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);
	ssaoProg.use();
	ssaoProg.setUniform("ssaoRadius", ssaoRadius);
	ssaoProg.setUniform("viewport", vec2(ssaoInit.width, ssaoInit.height));
	ssaoProg.setUniform("projMat", renderer->camera.projMat());
	depthMap.bind(11, ssaoProg, "depthMap");
	TriMesh::renderQuad(ssaoProg);
	ssaoInit.unuse();

	ssaoTemp.create(w, h/2, GL_FLOAT, 4, true);
	ssaoTemp.use();
	glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);
	ssaoBlurProg.use();
	ssaoBlurProg.setUniform("direction", 0);
	ssaoBlurProg.setUniform("sigma", blurSigma);
	ssaoBlurProg.setUniform("viewport", vec2(ssaoTemp.width, ssaoTemp.height));
	ssaoInit.bind(11, ssaoBlurProg, "ssaoMap");
	depthMap.bind(12, ssaoBlurProg, "depthMap");
	TriMesh::renderQuad(ssaoBlurProg);
	ssaoTemp.unuse();

	ssaoMap.create(w, h, GL_FLOAT, 4, true);
	ssaoMap.use();
	glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);
	ssaoBlurProg.use();
	ssaoBlurProg.setUniform("direction", 1);
	ssaoBlurProg.setUniform("viewport", vec2(ssaoMap.width, ssaoMap.height));
	ssaoTemp.bind(11, ssaoBlurProg, "ssaoMap");
	TriMesh::renderQuad(ssaoBlurProg);
	ssaoMap.unuse();

	prog.use();
	light.lightFactor = lightFactor;
	light.setUniform(prog);

	ibl.bind(6, prog, "ibl");
	prog.setUniform("iblFactor", iblFactor);
	prog.setUniform("La", light.ambientColor);
	prog.setUniform("ambientFactor", ambientFactor);

	irrMap.bind(7, prog, "irrMap");
	envMap.bind(8, prog, "envMap");
	envBRDF.bind(9, prog, "envBRDF");

	prog.setUniform("aoStrength", ssaoStrength);
	prog.setUniform("shadowViewMat", viewMat);
	prog.setUniform("shadowProjMat", projMat);
	shadowMap.bind(10, prog, "shadowMap");
	depthMap.bind(11, prog, "depthMap");
	ssaoMap.bind(12, prog, "ssaoMap");

	prog.setUniform("lightSize", lightSize);
	prog.setUniform("lightDirection", normalize(light.position - sceneCenter));
	renderGeom(prog);

	// ssaoMap.blit();
	// depthMap.blit(-1);
	// shadowMap.blit(-0.005);
	// envMapFB.blit(lightFactor);
	// envBRDF.blit();
	// irrMap.blit(lightFactor);
}

void dropFunc( const std::string& fn ) {
	if (getExtension(fn).compare("hdr") == 0) {
		loadHDR(fn);
	}
	else {
		loadFile(fn);
	}
}

float randf() {
	return rand() / float(RAND_MAX);
}

int main( int argc, const char * argv[] ) {

	if ( !glfwInit() ) {
		printf("FAil\n");
		exit(EXIT_FAILURE);
	}
	
	glfwWindowHint( GLFW_SAMPLES, 32 );
	GLFWwindow* window = glfwCreateWindow( 800, 600, "Hello", NULL, NULL );
	glfwMakeContextCurrent( window );
	if ( glewInit() ) {
		printf("FAil\n");
		exit(EXIT_FAILURE);
	}

	renderer = new Renderer(window);
	renderer->initFunc = initFunc;
	renderer->renderFunc = renderFunc;
	renderer->dropFunc = dropFunc;

	while ( !glfwWindowShouldClose( window ) ) {
		int fw, fh, ww, wh;
		glfwGetFramebufferSize( window, &fw, &fh );
		glfwGetWindowSize( window, &ww, &wh );

		renderer->render( fw, fh );
		renderer->renderUI(ww,wh,fw,fh);
		glFlush();
		glFinish();
		
		glfwSwapBuffers( window );
		glfwPollEvents();
	}
	glfwDestroyWindow( window );
	glfwTerminate();
	return 0;
}
