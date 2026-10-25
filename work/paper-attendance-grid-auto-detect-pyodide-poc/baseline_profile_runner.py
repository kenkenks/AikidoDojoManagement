"""Profile frozen one-shot main without editing the production algorithm."""
import gc,json,runpy,sys,time
from pathlib import Path
import numpy as np
from PIL import Image
from js import pocWasmHeapBytes

def main():
    algorithm,adapter_path,input_path,out,corners_path=map(Path,sys.argv[1:6]);out.mkdir(parents=True,exist_ok=True)
    adapter=runpy.run_path(str(adapter_path),run_name='baseline_adapter');samples=[];started_total=time.perf_counter()
    def output_bytes():
        return sum(p.stat().st_size for p in out.rglob('*') if p.is_file())
    def sample(stage):
        gc.collect();samples.append({'stage':stage,'wasm_heap_bytes':int(pocWasmHeapBytes()),'gc_tracked_objects':len(gc.get_objects()),'output_file_bytes':output_bytes()})
    original=Image.open(input_path).convert('RGB');sample('image_decode')
    normalized=np.asarray(json.loads(corners_path.read_text())['paper_corners'],dtype=np.float64);paper=normalized*np.asarray(original.size,dtype=np.float64);w,h=adapter['OUTPUT_SIZE'];dest=np.asarray([[0,0],[w-1,0],[w-1,h-1],[0,h-1]],dtype=np.float64)
    rectified=original.transform(adapter['OUTPUT_SIZE'],Image.Transform.PERSPECTIVE,adapter['projective_coefficients'](dest,paper),Image.Resampling.BICUBIC);del original,normalized,paper,dest;sample('paper_rectification')
    detection=adapter['auto_detect'](rectified);sample('auto_grid_detection');rectified_path=out/'rectified.jpg';rectified.save(rectified_path,quality=94)
    ns=runpy.run_path(str(algorithm),run_name='baseline_frozen');ns['detect_grid'].__globals__['SEED']=(detection['x_lines'][0]/w,detection['y_lines'][0]/h,detection['x_lines'][-1]/w,detection['y_lines'][-1]/h)
    original_transform=Image.Image.transform;transform_count=0
    def monitored_transform(self,*args,**kwargs):
        nonlocal transform_count
        result=original_transform(self,*args,**kwargs);transform_count+=1;sample('full_normalized_image' if transform_count==1 else 'full_character_image' if transform_count==2 else f'transform_{transform_count}');return result
    Image.Image.transform=monitored_transform
    original_label=ns['label_card'];label_count=0
    def monitored_label(*args,**kwargs):
        nonlocal label_count
        result=original_label(*args,**kwargs);label_count+=1
        if label_count in (100,200,300,400):sample(f'labeled_card_{label_count}')
        return result
    ns['label_card'].__globals__['label_card']=monitored_label
    previous=sys.argv
    try:
        sys.argv=[str(algorithm),str(rectified_path),str(out/'pipeline')];ns['main']()
    finally:
        sys.argv=previous;Image.Image.transform=original_transform
    sample('completed');manifest=json.loads((out/'pipeline'/'manifest.json').read_text());truth={1,21,41,61,81,101,121,141,161,181,201,221,241,261,262,281,282,301,302,321,322,341,342,361,362,381,382};detected={x['number'] for x in manifest['cards'] if x['status']!='blank'}
    report={'experiment':'frozen_one_shot_profile','detection':detection,'memory_samples':samples,'elapsed_ms':round((time.perf_counter()-started_total)*1000),'cards':len(manifest['cards']),'screening_counts':manifest['screening']['counts'],'written_truth_detected':len(truth&detected),'written_truth_missed':sorted(truth-detected)};(out/'baseline-profile.json').write_text(json.dumps(report))
if __name__=='__main__':main()
