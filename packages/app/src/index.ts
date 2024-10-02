import { randRange, tuple } from "@web-art/core";
import { Vector } from "@web-art/linear-algebra";
import config from "./config";
import { AppContext, AppContextWithState, appMethods } from "./lib/types";
import { createNoise2D } from "simplex-noise";

// Global
const viewShiftSpeed = 0.03;

// Trees
const branchChance = 0.1;
const maxBranches = 2;
const maxGrowth = 1;
const growthPerSecond = 0.04;
const minSegmentLength = 0.06;
const maxSegmentLength = 0.12;
const minAge = 0.02;
const maxAge = 0.04;
const maxAngleOffset = Math.PI / 6;
const preferredDirInfluence = 0.5;
const treesOnScreen = (dimensions: Vector<2>) =>
  Math.min(
    Math.max(Math.floor((dimensions.x() / dimensions.y() - 0.6) * 8), 3),
    15
  );
const colorSize = 0.03;
const treePalette = [
  "97729B",
  "99A39A",
  "4D917F",
  "F9EFF7",
  "D9D4CE",
  "CCC3B4",
  "B3B69B",
];
const minRadiusMultiplier = 0.006;
const maxRadiusMultiplier = 0.04;

// background
const noiseScale = 0.0013;
const backgroundIncrements = 100;
const backgroundPalette = [
  "845537",
  "BCA269",
  "575678",
  "9B6D56",
  "6F7A74",
  "867A8E",
  "7B8C82",
  "BED6E0",
];

const noise2D = createNoise2D();

interface Segment {
  start: Vector<2>;
  end: Vector<2>;
  length: number;
  colorStops: [number, string][];
  children?: Segment[];
}

interface Tree {
  created: number;
  xPercent: number;
  maxAge: number;
  root: Segment;
}

function randChoice<T>(arr: T[]): T | undefined {
  return arr[Math.floor(Math.random() * arr.length)];
}

function createSegment(parent: Segment, preferredDir: Vector<2>): Segment {
  const length = randRange(minSegmentLength, maxSegmentLength);
  const lastParentColorStop = parent.colorStops[parent.colorStops.length - 1];
  const colorStopOffset =
    lastParentColorStop != null
      ? parent.length * (1 - lastParentColorStop[0])
      : 0;

  return {
    length,
    start: parent.end,
    end: Vector.UP.setAngle(
      maxAngleOffset * (2 * Math.random() - 1) +
        parent.end.copy().sub(parent.start).getAngle()
    )
      .lerp(preferredDir, Math.pow(Math.random(), 1 / preferredDirInfluence))
      .setMagnitude(length)
      .add(parent.end),
    colorStops: new Array(
      Math.ceil((length - colorStopOffset) / colorSize + 1e-5)
    )
      .fill(undefined)
      .map((_, i) =>
        tuple(
          (i * colorSize + colorStopOffset) / length,
          randChoice(treePalette) ?? "white"
        )
      ),
  };
}

function createSegmentsRecursive(
  parent: Segment,
  maxGrowth: number,
  preferredDir: Vector<2>
): Segment {
  const segment = createSegment(parent, preferredDir);
  if (segment.length > maxGrowth) {
    return segment;
  } else {
    let numBranches = 1;
    for (let i = 0; i < maxBranches; i++) {
      numBranches += Number(Math.random() < branchChance);
    }
    const parentDir =
      parent.end.x() > parent.start.x() ? Vector.RIGHT : Vector.LEFT;
    return {
      ...segment,
      children: new Array(numBranches)
        .fill(undefined)
        .map((_, i) =>
          createSegmentsRecursive(
            segment,
            (maxGrowth - segment.length) * (i === 0 ? 1 : 0.4),
            i === 0
              ? preferredDir
              : Vector.UP.lerp(parentDir, Math.random() ** 0.25)
          )
        ),
    };
  }
}

function createTree(created: number, xPercent: number): Tree {
  return {
    created,
    xPercent,
    maxAge: randRange(minAge, maxAge),
    root: createSegmentsRecursive(
      { start: Vector.DOWN, end: Vector.zero(2), length: 1, colorStops: [] },
      maxGrowth * (1 - Math.random() * 0.2),
      Vector.UP
    ),
  };
}

function drawSegmentRecursive({
  ctx,
  segment,
  parent,
  offset,
  age,
  scale,
}: {
  ctx: CanvasRenderingContext2D;
  segment: Segment;
  parent?: Segment;
  offset: Vector<2>;
  age: number;
  scale: number;
}): void {
  const drawStart = segment.start.copy().multiply(scale).add(offset);
  const drawEnd = segment.end.copy().multiply(scale).add(offset);

  const timeToGrow = segment.length / growthPerSecond;
  const drawEndLerped =
    age < timeToGrow ? drawStart.lerp(drawEnd, age / timeToGrow) : drawEnd;

  const gradient = ctx.createLinearGradient(
    drawStart.x(),
    drawStart.y(),
    drawEnd.x(),
    drawEnd.y()
  );
  const lastParentColor = parent?.colorStops[parent.colorStops.length - 1]?.[1];
  const firstStop = segment.colorStops[0]?.[0];
  if (lastParentColor != null && firstStop != null && firstStop > 0) {
    gradient.addColorStop(firstStop, `#${lastParentColor}`);
  }
  segment.colorStops.forEach(([stop, col], i) => {
    gradient.addColorStop(stop, `#${col}`);
    const nextStop = segment.colorStops[i + 1]?.[0];
    if (nextStop != null) {
      gradient.addColorStop(nextStop, `#${col}`);
    }
  });

  ctx.strokeStyle = gradient;
  ctx.lineCap = "round";
  ctx.lineWidth = Math.max(
    1,
    scale *
      (minRadiusMultiplier +
        (maxRadiusMultiplier - minRadiusMultiplier) *
          (age / (maxGrowth / growthPerSecond)))
  );

  ctx.beginPath();
  ctx.moveTo(drawStart.x(), drawStart.y());
  ctx.lineTo(drawEndLerped.x(), drawEndLerped.y());
  ctx.stroke();

  if (age > timeToGrow) {
    segment.children?.forEach(child => {
      drawSegmentRecursive({
        ctx,
        parent: segment,
        segment: child,
        offset,
        age: age - timeToGrow,
        scale: scale,
      });
    });
  }
}

function checkSegmentsInBounds(
  segment: Segment,
  xOffset: number,
  scale: number
): boolean {
  return (
    scale * segment.start.x() + xOffset > 0 ||
    scale * segment.end.x() + xOffset > 0 ||
    (segment.children?.some(child =>
      checkSegmentsInBounds(child, xOffset, scale)
    ) ??
      false)
  );
}

interface State {
  trees: Tree[];
}

function init({ time, canvas }: AppContext<typeof config>): State {
  return {
    trees: new Array(treesOnScreen(Vector.create(canvas.width, canvas.height)))
      .fill(undefined)
      .map((_, i, arr) =>
        createTree(
          time.now -
            ((arr.length - 1 - i) / (arr.length - 1)) *
              (maxGrowth / growthPerSecond),
          i / (arr.length - 1)
        )
      ),
  };
}

function animationFrame({
  state,
  canvas,
  ctx,
  time,
}: AppContextWithState<typeof config, State>): State {
  const dimensions = Vector.create(canvas.width, canvas.height);

  const lastTree = state.trees[state.trees.length - 1];
  if (
    lastTree != null &&
    time.now - lastTree.created >
      1 / (treesOnScreen(dimensions) * viewShiftSpeed)
  ) {
    state.trees.push(createTree(time.now, 1));
  }

  const scale = dimensions.y() * 0.8;

  const trees = state.trees
    .map(tree => ({
      ...tree,
      xPercent: tree.xPercent - viewShiftSpeed * time.delta,
    }))
    .filter(tree =>
      checkSegmentsInBounds(tree.root, dimensions.x() * tree.xPercent, scale)
    );

  const backgroundOffset =
    ((1 / backgroundPalette.length) * dimensions.y()) / 1.5;
  for (let i = backgroundPalette.length - 1; i >= 0; i--) {
    ctx.fillStyle = `#${backgroundPalette[i]}`;

    if (i === backgroundPalette.length - 1) {
      ctx.fillRect(0, 0, dimensions.x(), dimensions.y());
    } else {
      const yLine = (1 - (i + 1) / backgroundPalette.length) * dimensions.y();

      ctx.beginPath();
      ctx.moveTo(dimensions.x(), dimensions.y());
      ctx.lineTo(0, dimensions.y());
      for (let j = 0; j < backgroundIncrements; j++) {
        const xPos = (dimensions.x() * j) / (backgroundIncrements - 1);
        ctx.lineTo(
          xPos,
          yLine +
            noise2D(
              noiseScale * xPos +
                ((backgroundPalette.length - i - 1) / 3) *
                  (viewShiftSpeed * time.now),
              yLine
            ) *
              backgroundOffset
        );
      }
      ctx.fill();
    }
  }

  trees.forEach(tree => {
    drawSegmentRecursive({
      ctx,
      segment: tree.root,
      offset: dimensions.with(0, dimensions.x() * tree.xPercent),
      age: time.now - tree.created,
      scale: scale,
    });
  });

  return { ...state, trees };
}

export default appMethods.stateful({ init, animationFrame });
