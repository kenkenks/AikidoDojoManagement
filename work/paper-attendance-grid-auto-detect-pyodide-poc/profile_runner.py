"""Memory-profiled exact-grid, quadrant-output experiment for P3-5."""
from __future__ import annotations

import gc
import json
import runpy
import sys
import time
import traceback
from pathlib import Path

import numpy as np
from PIL import Image

try:
    from js import pocWasmHeapBytes
except ImportError:
    pocWasmHeapBytes = lambda: 0

CURRENT_STAGE = "runtime"

def emit(stage, percent, message):
    # _post_message is intentionally not used: callbacks materially changed
    # the measured runtime. Exact stage timings are returned in profile.json.
    return None


def main():
    global CURRENT_STAGE
    algorithm_path, adapter_path, input_path, output_path, corners_path = map(Path, sys.argv[1:6])
    output_path.mkdir(parents=True, exist_ok=True); cards_dir = output_path/"cards"; cards_dir.mkdir(exist_ok=True)
    ns = runpy.run_path(str(algorithm_path), run_name="p35_frozen_algorithm")
    adapter = runpy.run_path(str(adapter_path), run_name="p35_adapter")
    rows, cols, card_w, card_h, subdiv = (ns[x] for x in ("ROWS","COLS","CARD_W","CARD_H","MESH_SUBDIV"))
    samples, timings = [], {}; started_total = time.perf_counter()

    def sample(stage, arrays=None):
        gc.collect()
        samples.append({"stage": stage, "wasm_heap_bytes": int(pocWasmHeapBytes()),
                        "gc_tracked_objects": len(gc.get_objects()),
                        "live_numpy_bytes": sum(int(value.nbytes) for value in (arrays or []) if isinstance(value, np.ndarray))})

    def stage(name, fn, arrays=None):
        global CURRENT_STAGE
        CURRENT_STAGE=name
        labels={"image_decode":(8,"画像をデコードしています"),"paper_rectification":(12,"紙面を正面化しています"),"auto_grid_detection":(17,"20×20格子を自動検出しています"),"grayscale":(22,"濃淡画像を準備しています"),"horizontal_tracking":(28,"横罫線を追跡しています"),"vertical_tracking_and_441_intersections":(50,"縦罫線と441交点を追跡しています"),"vertical_segment_tracking":(74,"交点間の縦罫線を追跡しています"),"coons_mesh_generation":(82,"Coons補正メッシュを生成しています")}
        percent,message=labels.get(name,(5,name));emit(name,percent,message)
        started=time.perf_counter(); value=fn(); timings[name]=round((time.perf_counter()-started)*1000); sample(name, arrays(value) if callable(arrays) else arrays); return value

    source_original = stage("image_decode", lambda: Image.open(input_path).convert("RGB"))
    normalized_corners=np.asarray(json.loads(corners_path.read_text(encoding="utf-8"))["paper_corners"],dtype=np.float64)
    paper=normalized_corners*np.asarray(source_original.size,dtype=np.float64); width,height=adapter["OUTPUT_SIZE"]
    destination=np.asarray([[0,0],[width-1,0],[width-1,height-1],[0,height-1]],dtype=np.float64)
    source = stage("paper_rectification", lambda: source_original.transform(adapter["OUTPUT_SIZE"],Image.Transform.PERSPECTIVE,adapter["projective_coefficients"](destination,paper),Image.Resampling.BICUBIC))
    del source_original, paper, destination, normalized_corners; sample("after_rectification_cleanup")
    detection=stage("auto_grid_detection",lambda:adapter["auto_detect"](source))
    x_lines,y_lines=detection["x_lines"],detection["y_lines"]
    gray=stage("grayscale",lambda:np.asarray(source.convert("L")),lambda value:[value])
    dark=gray<165; sample("dark_mask",[gray,dark])
    horizontal=stage("horizontal_tracking",lambda:ns["trace_horizontal_rules"](gray,x_lines,y_lines,subdiv),[gray,dark])
    points=stage("vertical_tracking_and_441_intersections",lambda:ns["vertical_intersections_from_continuous_rules"](gray,x_lines,horizontal),[gray,dark])
    horizontal=ns["align_horizontal_x_to_intersections"](horizontal,points,subdiv)

    def make_vertical():
        result=[]
        for c in range(cols+1):
            column=[]
            for r in range(rows):
                segment=ns["trace_vertical_segment"](dark,points[r][c],points[r+1][c],subdiv)
                column.extend(segment if r==0 else segment[1:])
            result.append(column)
        return result
    vertical=stage("vertical_segment_tracking",make_vertical,[gray,dark])
    extraction_points=[list(row) for row in points]; extraction_horizontal=[list(row) for row in horizontal]; extraction_vertical=[list(col) for col in vertical]
    source_h,source_w=gray.shape;margin=ns["CHARACTER_SOURCE_MARGIN"]
    extraction_horizontal[0]=[(x,max(0,y-margin)) for x,y in extraction_horizontal[0]]
    extraction_horizontal[-1]=[(x,min(source_h-1,y+margin)) for x,y in extraction_horizontal[-1]]
    for r in range(rows+1):
        x,y=extraction_horizontal[r][0];extraction_horizontal[r][0]=(max(0,x-margin),y)
        x,y=extraction_horizontal[r][-1];extraction_horizontal[r][-1]=(min(source_w-1,x+margin),y)
    extraction_vertical[0]=[(max(0,x-margin),y) for x,y in extraction_vertical[0]]
    extraction_vertical[-1]=[(min(source_w-1,x+margin),y) for x,y in extraction_vertical[-1]]
    for c in range(cols+1):
        x,y=extraction_vertical[c][0];extraction_vertical[c][0]=(x,max(0,y-margin))
        x,y=extraction_vertical[c][-1];extraction_vertical[c][-1]=(x,min(source_h-1,y+margin))
    for r in range(rows+1):
        for c in range(cols+1):
            x,y=extraction_points[r][c]
            if c==0:x=max(0,x-margin)
            if c==cols:x=min(source_w-1,x+margin)
            if r==0:y=max(0,y-margin)
            if r==rows:y=min(source_h-1,y+margin)
            extraction_points[r][c]=(x,y)
    mesh=stage("coons_mesh_generation",lambda:ns["build_mesh"](dark,x_lines,y_lines,extraction_points,extraction_horizontal,extraction_vertical),[gray,dark])
    del points,horizontal,vertical,extraction_points,extraction_horizontal,extraction_vertical;sample("after_tracking_cleanup",[gray,dark])

    def quadrant_mesh(qr,qc):
        ox,oy=qc*10*card_w,qr*10*card_h;x2,y2=ox+10*card_w,oy+10*card_h
        return [((box[0]-ox,box[1]-oy,box[2]-ox,box[3]-oy),quad) for box,quad in mesh if box[0]>=ox and box[2]<=x2 and box[1]>=oy and box[3]<=y2]
    manifest=[];warp_ms=cards_ms=0
    for qr in range(2):
        for qc in range(2):
            CURRENT_STAGE=f"quadrant_{qr*2+qc+1}"
            emit(CURRENT_STAGE,86+(qr*2+qc)*3,f"補正画像とカードを生成しています（{qr*2+qc+1}/4）")
            started=time.perf_counter();quadrant=source.transform((10*card_w,10*card_h),Image.Transform.MESH,quadrant_mesh(qr,qc),Image.Resampling.BICUBIC);warp_ms+=round((time.perf_counter()-started)*1000);sample(f"coons_warp_q{qr*2+qc+1}",[gray,dark])
            started=time.perf_counter()
            for lr in range(10):
                for lc in range(10):
                    r,c=qr*10+lr,qc*10+lc;card=quadrant.crop((lc*card_w,lr*card_h,(lc+1)*card_w,(lr+1)*card_h));_mask,score,background=ns["ink_mask"](card)
                    status="candidate" if score>=900 else "review" if score>=180 else "blank";number=r*cols+c+1
                    card.save(cards_dir/f"card-{number:03d}.png");manifest.append({"number":number,"status":status,"ink_score":score,"background_level":round(background,2)})
            cards_ms+=round((time.perf_counter()-started)*1000);del quadrant;sample(f"cards_q{qr*2+qc+1}",[gray,dark])
    timings["coons_warp"]=warp_ms;timings["card_generation"]=cards_ms
    truth={1,21,41,61,81,101,121,141,161,181,201,221,241,261,262,281,282,301,302,321,322,341,342,361,362,381,382}
    detected={item["number"] for item in manifest if item["status"]!="blank"};timings["total"]=round((time.perf_counter()-started_total)*1000)
    report={"experiment":"exact_tracking_quadrant_output","detection":detection,"timings_ms":timings,"memory_samples":samples,"cards":len(manifest),
            "screening_counts":{name:sum(1 for x in manifest if x["status"]==name) for name in ("candidate","review","blank")},
            "written_truth_detected":len(truth&detected),"written_truth_missed":sorted(truth-detected)}
    (output_path/"profile.json").write_text(json.dumps(report,ensure_ascii=False),encoding="utf-8")
    emit("complete",100,"400カードの生成が完了しました")


if __name__=="__main__":
    try:
        main()
    except Exception as error:
        output=Path(sys.argv[4]);output.mkdir(parents=True,exist_ok=True)
        detail=traceback.format_exc()
        (output/"error.json").write_text(json.dumps({"stage":CURRENT_STAGE,"code":type(error).__name__,"message":str(error),"detail":detail},ensure_ascii=False),encoding="utf-8")
