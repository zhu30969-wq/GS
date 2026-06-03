% generate_theory_matlab_plots.m
% MATLAB simulation assets for the diffraction-grating principle module.
%
% Physics model:
%   Single-slit envelope:
%     E(theta) = [sin(beta) / beta]^2, beta = pi * b * sin(theta) / lambda.
%   N-slit grating intensity under that envelope:
%     I(theta) = E(theta) * [sin(N * alpha) / (N * sin(alpha))]^2,
%     alpha = pi * d * sin(theta) / lambda.
%   Principal maxima:
%     d * sin(theta_j) = j * lambda.
%   Single-slit minima:
%     b * sin(theta) = k * lambda, k = +-1, +-2, ...
%   Missing order condition:
%     If a grating principal maximum also satisfies a single-slit minimum,
%     then j * b / d is an integer and the corresponding grating order is absent.
%
% The page uses j for diffraction order and b for slit width.

clear; close all; clc;

outDir = fullfile(fileparts(fileparts(mfilename("fullpath"))), "simulations");
if ~exist(outDir, "dir")
    mkdir(outDir);
end

% Shared colors tuned for the dark CAD-style theory page.
bg = [8 22 34] / 255;
panel = [13 33 50] / 255;
axisColor = [0.82 0.90 1.00];
gridColor = [0.34 0.47 0.62];
envColor = [0.57 0.49 1.00];
intensityColor = [0.93 0.97 1.00];
pointColor = [1.00 0.42 0.28];
missingColor = [1.00 0.78 0.25];

%% Figure 1: N-slit grating intensity constrained by a single-slit envelope.
lambda_um = 0.650;  % visible red light, micrometre
b_um = 2.000;       % single slit width
d_um = 6.000;       % grating constant; d/b = 3 gives missing j = +-3
N = 12;             % finite slit number, enough to show narrow principal maxima

theta = linspace(-42, 42, 9000) * pi / 180;
s = sin(theta);
beta = pi * b_um * s / lambda_um;
alpha = pi * d_um * s / lambda_um;

envelope = sinc_pi(beta) .^ 2;
interference = grating_factor(alpha, N);
intensity = envelope .* interference;
intensity = intensity / max(intensity);
envelope = envelope / max(envelope);

fig = figure("Visible", "off", "Color", bg, "Position", [80 80 1280 620]);
ax = axes(fig);
hold(ax, "on");
set(ax, "Color", panel, "XColor", axisColor, "YColor", axisColor, ...
    "FontName", "Microsoft YaHei UI", "FontSize", 14, "LineWidth", 1.2);
grid(ax, "on");
ax.GridColor = gridColor;
ax.GridAlpha = 0.22;
ax.MinorGridAlpha = 0.10;

plot(ax, theta * 180 / pi, envelope, "--", "Color", envColor, "LineWidth", 3.2);
plot(ax, theta * 180 / pi, intensity, "-", "Color", intensityColor, "LineWidth", 1.7);

validOrders = [];
for j = -floor(d_um / lambda_um):floor(d_um / lambda_um)
    st = j * lambda_um / d_um;
    if abs(st) <= 1
        th = asin(st);
        if abs(th) <= max(abs(theta))
            envJ = sinc_pi(pi * b_um * sin(th) / lambda_um) ^ 2;
            missing = is_missing_order(j, b_um, d_um);
            if abs(j) <= 4
                if missing
                    plot(ax, th * 180 / pi, 0, "o", "MarkerFaceColor", missingColor, ...
                        "MarkerEdgeColor", missingColor, "MarkerSize", 8);
                    text(ax, th * 180 / pi, 0.10, sprintf("j=%+d 缺级", j), ...
                        "Color", missingColor, "HorizontalAlignment", "center", ...
                        "FontName", "Microsoft YaHei UI", "FontSize", 11);
                else
                    plot(ax, th * 180 / pi, envJ, "o", "MarkerFaceColor", pointColor, ...
                        "MarkerEdgeColor", pointColor, "MarkerSize", 7);
                    text(ax, th * 180 / pi, min(envJ + 0.09, 1.06), sprintf("j=%+d", j), ...
                        "Color", axisColor, "HorizontalAlignment", "center", ...
                        "FontName", "Microsoft YaHei UI", "FontSize", 11);
                end
                validOrders(end + 1) = j; %#ok<SAGROW>
            end
        end
    end
end

xline(ax, 0, "-", "Color", [0.72 0.83 0.96], "LineWidth", 1.1);
yline(ax, 0, "-", "Color", [0.72 0.83 0.96], "LineWidth", 1.1);
xlim(ax, [-42 42]);
ylim(ax, [-0.02 1.12]);
xlabel(ax, "衍射角 \theta (°)", "Color", axisColor, "FontWeight", "bold", "FontSize", 15);
ylabel(ax, "相对光强 I / I_0", "Color", axisColor, "FontWeight", "bold", "FontSize", 15);
title(ax, "有限多缝光栅强度与单缝 sinc^2 包络", ...
    "Color", [0.96 0.99 1.00], "FontWeight", "bold", "FontSize", 19);
legend(ax, {"单缝包络", "光栅光强"}, "TextColor", axisColor, ...
    "Color", [0.05 0.13 0.20], "EdgeColor", [0.20 0.31 0.44], ...
    "Location", "northeast", "FontSize", 12);
exportgraphics(fig, fullfile(outDir, "single_slit_envelope_multislit_cn.png"), "Resolution", 180);
close(fig);

%% Figure 2: central bright-fringe width from first single-slit minima.
lambda_um = 0.650;
b_um = 100.0;
L_m = 1.000;

theta = linspace(-1.2, 1.2, 6000) * pi / 180;
y_mm = L_m * tan(theta) * 1000;
beta = pi * b_um * sin(theta) / lambda_um;
singleIntensity = sinc_pi(beta) .^ 2;

theta1 = asin(lambda_um / b_um);
y1_mm = L_m * tan(theta1) * 1000;
widthExact_mm = 2 * y1_mm;
widthSmall_mm = 2 * (lambda_um * 1e-6) * L_m * 1000 / (b_um * 1e-6);

fig = figure("Visible", "off", "Color", bg, "Position", [80 80 1280 620]);
ax = axes(fig);
hold(ax, "on");
set(ax, "Color", panel, "XColor", axisColor, "YColor", axisColor, ...
    "FontName", "Microsoft YaHei UI", "FontSize", 14, "LineWidth", 1.2);
grid(ax, "on");
ax.GridColor = gridColor;
ax.GridAlpha = 0.22;

area(ax, y_mm, singleIntensity, "FaceColor", [0.24 0.43 0.78], ...
    "FaceAlpha", 0.18, "EdgeColor", "none");
plot(ax, y_mm, singleIntensity, "-", "Color", intensityColor, "LineWidth", 2.6);
xline(ax, -y1_mm, "--", "Color", envColor, "LineWidth", 2.3);
xline(ax, y1_mm, "--", "Color", envColor, "LineWidth", 2.3);
xline(ax, 0, "-", "Color", [0.72 0.83 0.96], "LineWidth", 1.2);
yline(ax, 0, "-", "Color", [0.72 0.83 0.96], "LineWidth", 1.1);

text(ax, -y1_mm, 0.08, "-y_1", "Color", axisColor, "HorizontalAlignment", "center", ...
    "FontName", "Microsoft YaHei UI", "FontSize", 13);
text(ax, y1_mm, 0.08, "+y_1", "Color", axisColor, "HorizontalAlignment", "center", ...
    "FontName", "Microsoft YaHei UI", "FontSize", 13);
text(ax, 0, 1.04, "中央明纹", "Color", [0.96 0.99 1.00], ...
    "HorizontalAlignment", "center", "FontName", "Microsoft YaHei UI", "FontSize", 18, ...
    "FontWeight", "bold");
text(ax, 0, -0.115, sprintf("\\Delta y = %.2f mm", widthExact_mm), ...
    "Color", envColor, "HorizontalAlignment", "center", ...
    "FontName", "Microsoft YaHei UI", "FontSize", 16, "FontWeight", "bold");

xlim(ax, [-18 18]);
ylim(ax, [-0.18 1.12]);
xlabel(ax, "屏幕位置 y (mm)", "Color", axisColor, "FontWeight", "bold", "FontSize", 15);
ylabel(ax, "相对光强 I / I_0", "Color", axisColor, "FontWeight", "bold", "FontSize", 15);
title(ax, "单缝 sinc^2 衍射与中央明纹宽度", ...
    "Color", [0.96 0.99 1.00], "FontWeight", "bold", "FontSize", 19);
exportgraphics(fig, fullfile(outDir, "central_maximum_width_cn.png"), "Resolution", 180);
close(fig);

fprintf("Generated MATLAB theory plots in: %s\n", outDir);

function y = sinc_pi(x)
% MATLAB's sinc is normalized as sin(pi*x)/(pi*x). This helper implements
% the physics convention sin(x)/x and handles x = 0 by continuity.
    y = ones(size(x));
    mask = abs(x) > 1e-12;
    y(mask) = sin(x(mask)) ./ x(mask);
end

function g = grating_factor(alpha, N)
% Normalized finite-N interference factor, with the alpha = 0 limit set to 1.
    denominator = sin(alpha);
    numerator = sin(N * alpha);
    g = ones(size(alpha));
    mask = abs(denominator) > 1e-10;
    g(mask) = (numerator(mask) ./ (N * denominator(mask))) .^ 2;
end

function result = is_missing_order(j, b, d)
% Principal order j is missing when it coincides with a single-slit minimum:
% d sin(theta) = j lambda and b sin(theta) = k lambda => k = j b / d.
    if j == 0
        result = false;
        return;
    end
    k = j * b / d;
    result = abs(k - round(k)) < 1e-9;
end
