// Author: @karimnaaji

uniform vec2 resolution;
uniform float time;

out vec4 out_color;

#define PI                      3.141592
#define BETA_R                  vec3(5.5e-6, 13.0e-6, 22.4e-6)
#define BETA_M                  vec3(21e-6, 21e-6, 21e-6)
#define MIE_G                   0.76
#define DENSITY_HEIGHT_SCALE_R  8000.0
#define DENSITY_HEIGHT_SCALE_M  1200.0
#define PLANET_RADIUS           6360e3
#define ATMOSPHERE_RADIUS       6420e3
#define SAMPLE_STEPS            10
#define DENSITY_STEPS           10

//#define USE_GUI
#ifdef USE_GUI

@slider1(0.0, 50.0)
uniform float sun_intensity;
@slider1(0.0, 10.0)
uniform float moon_intensity;
@slider1(0.0, 5.0)
uniform float density_scalar_m;
@slider1(0.0, 5.0)
uniform float density_scalar_r;
@color3
uniform vec3 rayleigh_color_tint;

#define SUN_INTENSITY           sun_intensity
#define MOON_INTENSITY          moon_intensity
#define DENSITY_SCALAR_M        density_scalar_m
#define DENSITY_SCALAR_R        density_scalar_r
#define COLOR_TINT_R            rayleigh_color_tint

#else

#define SUN_INTENSITY           25.0
#define MOON_INTENSITY          2.0
#define DENSITY_SCALAR_M        0.3
#define DENSITY_SCALAR_R        1.3
#define COLOR_TINT_R            vec3(1.0)

#endif

float ray_scphere_exit(vec3 orig, vec3 dir, float radius) {
    float a = dot(dir, dir);
    float b = 2.0 * dot(dir, orig);
    float c = dot(orig, orig) - radius * radius;
    float d = sqrt(b * b - 4.0 * a * c);
    return (-b + d) / (2.0 * a);
}

vec3 extinction(vec2 density) {
    return exp(-vec3(BETA_R * DENSITY_SCALAR_R * density.x + BETA_M * DENSITY_SCALAR_M * density.y));
}

vec2 local_density(vec3 point) {
    float height = max(length(point) - PLANET_RADIUS, 0.0);
    return exp(-vec2(height / DENSITY_HEIGHT_SCALE_R, height / DENSITY_HEIGHT_SCALE_M));
}

float phase_ray(float cos_angle) {
    return (3.0 / (16.0 * PI)) * (1.0 + cos_angle * cos_angle);
}

float phase_mie(float cos_angle) {
    return (3.0 / (8.0 * PI)) * ((1.0 - MIE_G * MIE_G) * (1.0 + cos_angle * cos_angle)) /
        ((2.0 + MIE_G * MIE_G) * pow(1.0 + MIE_G * MIE_G - 2.0 * MIE_G * cos_angle, 1.5));
}

vec2 density_to_atmosphere(vec3 point, vec3 light_dir) {
    float ray_len = ray_scphere_exit(point, light_dir, ATMOSPHERE_RADIUS);
    float step_len = ray_len / float(DENSITY_STEPS);

    vec2 density_point_to_atmosphere = vec2(0.0);
    for (int i = 0; i < DENSITY_STEPS; ++i) {
        vec3 point_on_ray = point + light_dir * ((float(i) + 0.5) * step_len);
        density_point_to_atmosphere += local_density(point_on_ray) * step_len;;
    }

    return density_point_to_atmosphere;
}

vec3 atmosphere(vec3 ray_dir, vec3 ray_origin, vec3 sun_position, float sun_intensity) {
    vec2 density_orig_to_point = vec2(0.0);
    vec3 light_dir = normalize(sun_position);
    vec3 scatter_r = vec3(0.0);
    vec3 scatter_m = vec3(0.0);

    float ray_len = ray_scphere_exit(ray_origin, ray_dir, ATMOSPHERE_RADIUS);
    float step_len = ray_len / float(SAMPLE_STEPS);
    for (int i = 0; i < SAMPLE_STEPS; ++i) {
        vec3 point_on_ray = ray_origin + ray_dir * ((float(i) + 0.5) * step_len);

        // Local density
        vec2 density = local_density(point_on_ray) * step_len;
        density_orig_to_point += density;

        // Density from point to atmosphere
        vec2 density_point_to_atmosphere = density_to_atmosphere(point_on_ray, light_dir);

        // Scattering contribution
        vec2 density_orig_to_atmosphere = density_orig_to_point + density_point_to_atmosphere;
        vec3 extinction = extinction(density_orig_to_atmosphere);
        scatter_r += density.x * extinction;
        scatter_m += density.y * extinction;
    }

    // The mie and rayleigh phase functions describe how much light
    // is scattered towards the eye when colliding with particles
    float cos_angle = dot(ray_dir, light_dir);
    float phase_r = phase_ray(cos_angle);
    float phase_m = phase_mie(cos_angle);

    // Calculate light color
    float turbidity = 2.0;
    vec3 beta_m = BETA_M * turbidity;
    vec3 beta_r = BETA_R * COLOR_TINT_R;
    vec3 out_color = (scatter_r * phase_r * beta_r + scatter_m * phase_m * beta_m) * sun_intensity;

    const float sun_angular_diameter = 0.9998;
    float sundisk = smoothstep(sun_angular_diameter, sun_angular_diameter + 0.00002, cos_angle);

    out_color = mix(out_color, vec3(sundisk), 0.5);

    return out_color;
}

const float A = 0.15;
const float B = 0.50;
const float C = 0.10;
const float D = 0.20;
const float E = 0.02;
const float F = 0.30;

vec3 uncharted2_tonemap(vec3 x) {
   return ((x * (A * x + C * B) + D * E) / (x * (A * x + B) + D * F)) - E / F;
}

float rand(vec2 v) {
    return 2.0 * fract(4356.17 * sin(1e4 * dot(v, vec2(1.0, 171.3)))) - 1.0;
}

#define MOD3 vec3(443.8975,397.2973, 491.1871)
float hash12(vec2 p)
{
    vec3 p3 = fract(vec3(p.xyx) * MOD3);
    p3 += dot(p3, p3.yzx + 19.19);
    return fract((p3.x + p3.y) * p3.z);
}

void main() {
    vec2 uv = gl_FragCoord.xy / resolution;
    vec3 position = vec3(uv * 4.0 - 1.0, -1.0);
    position.y += 1.0;
    position.x -= 1.5;

    vec3 color = vec3(0.0);
    vec3 sun_position = vec3(0.0, 0.001, -1.0);

    vec3 sun_light = atmosphere(normalize(position), vec3(0.0, PLANET_RADIUS, 0), sun_position, SUN_INTENSITY);
    vec3 moon_light = vec3(0.0);
    if (sun_position.y < 0.0) {
        moon_light = atmosphere(normalize(position), vec3(0.0, PLANET_RADIUS, 0), vec3(0.0, 1.0, 0.0), MOON_INTENSITY);
        color = mix(sun_light, moon_light, -sun_position.y * 0.5 + 0.5);
    } else {
        color = sun_light;
    }

    // Apply exposure
    float luminance = 5e-5;
    float white_scale = 1.0748724675633854;
    color = uncharted2_tonemap((log2(2.0 / pow(luminance, 4.0))) * color) * white_scale;

    // Dither
    vec3 rnd = vec3(hash12(uv + fract(time)));
    color += rnd / 255.0;

    out_color = vec4(color, 1.0);
}
