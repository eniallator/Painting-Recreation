import { randRange } from "@web-art/core";
import { Vector } from "@web-art/linear-algebra";
import config from "./config";
import { AppContext, AppContextWithState, appMethods } from "./lib/types";
import { createNoise2D } from "simplex-noise";

const branchChance = 0.1;
const maxBranches = 2;
const maxGrowth = 1;
const growthPerSecond = 0.06;
const minSegmentLength = 0.06;
const maxSegmentLength = 0.12;
const minAge = 0.02;
const maxAge = 0.04;
const maxAngleOffset = Math.PI / 6;
const preferredDirInfluence = 0.5;
const treesOnScreen = 10;
const viewShiftSpeed = 0.03;
const noise2D = createNoise2D();
const noiseScale = 0.002;
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

interface Segment {
  start: Vector<2>;
  end: Vector<2>;
  children?: Segment[];
}

interface Tree {
  created: number;
  xPercent: number;
  maxAge: number;
  root: Segment;
}

function createSegment(parent: Segment, preferredDir: Vector<2>): Segment {
  return {
    start: parent.end,
    end: Vector.UP.setAngle(
      maxAngleOffset * (2 * Math.random() - 1) +
        parent.end.copy().sub(parent.start).getAngle()
    )
      .lerp(preferredDir, Math.pow(Math.random(), 1 / preferredDirInfluence))
      .setMagnitude(randRange(minSegmentLength, maxSegmentLength))
      .add(parent.end),
  };
}

function createSegmentsRecursive(
  parent: Segment,
  maxGrowth: number,
  preferredDir: Vector<2>
): Segment {
  const segment = createSegment(parent, preferredDir);
  const length = segment.start.distTo(segment.end);
  if (length > maxGrowth) {
    return segment;
  } else {
    return {
      ...segment,
      children: new Array(
        1 +
          new Array<number>(maxBranches)
            .fill(branchChance)
            .reduce((acc, curr) => acc + Number(Math.random() < curr), 0)
      )
        .fill(undefined)
        .map((_, i) =>
          createSegmentsRecursive(
            segment,
            (maxGrowth - length) * (i === 0 ? 1 : 0.4),
            i === 0
              ? preferredDir
              : Vector.UP.lerp(
                  parent.end.x() > parent.start.x()
                    ? Vector.RIGHT
                    : Vector.LEFT,
                  Math.random() ** 0.25
                )
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
      { start: Vector.DOWN, end: Vector.zero(2) },
      maxGrowth * (1 - Math.random() * 0.2),
      Vector.UP
    ),
  };
}

function drawSegmentRecursive(
  ctx: CanvasRenderingContext2D,
  segment: Segment,
  offset: Vector<2>,
  age: number,
  yScale: number
): void {
  const length = segment.start.distTo(segment.end);
  const timeToGrow = length / growthPerSecond;

  ctx.moveTo(
    yScale * segment.start.x() + offset.x(),
    yScale * segment.start.y() + offset.y()
  );
  if (timeToGrow <= age) {
    ctx.lineTo(
      yScale * segment.end.x() + offset.x(),
      yScale * segment.end.y() + offset.y()
    );
    segment.children?.forEach(child => {
      drawSegmentRecursive(ctx, child, offset, age - timeToGrow, yScale);
    });
  } else {
    const endPos = segment.start.lerp(segment.end, age / timeToGrow);
    ctx.lineTo(
      yScale * endPos.x() + offset.x(),
      yScale * endPos.y() + offset.y()
    );
  }
}

function checkSegmentsInBounds(segment: Segment, xOffset: number): boolean {
  return (
    segment.start.x() + xOffset > 0 ||
    segment.end.x() + xOffset > 0 ||
    (segment.children?.some(child => checkSegmentsInBounds(child, xOffset)) ??
      false)
  );
}

interface State {
  trees: Tree[];
}

function init({ ctx, time }: AppContext<typeof config>): State {
  ctx.fillStyle = "black";
  ctx.strokeStyle = "white";
  ctx.lineWidth = 5;
  ctx.lineCap = "round";

  return {
    trees: new Array(treesOnScreen)
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
    time.now - lastTree.created > 1 / (treesOnScreen * viewShiftSpeed)
  ) {
    state.trees.push(createTree(time.now, 1));
  }

  const trees = state.trees
    .map(tree => ({
      ...tree,
      xPercent: tree.xPercent - viewShiftSpeed * time.delta,
    }))
    .filter(tree =>
      checkSegmentsInBounds(tree.root, dimensions.x() * tree.xPercent)
    );

  for (let i = backgroundPalette.length - 1; i >= 0; i--) {
    ctx.fillStyle = `#${backgroundPalette[i]}`;
    const yLine = (1 - (i + 1) / backgroundPalette.length) * dimensions.y();
    const yOffset = ((1 / backgroundPalette.length) * dimensions.y()) / 2;

    if (i === backgroundPalette.length - 1) {
      ctx.fillRect(0, 0, dimensions.x(), dimensions.y());
    } else {
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
              yOffset
        );
      }
      ctx.fill();
    }
  }

  ctx.beginPath();
  trees.forEach(tree => {
    drawSegmentRecursive(
      ctx,
      tree.root,
      dimensions.with(0, dimensions.x() * tree.xPercent),
      time.now - tree.created,
      dimensions.y() * 0.8
    );
  });
  ctx.stroke();

  return { ...state, trees };
}

export default appMethods.stateful({ init, animationFrame });
