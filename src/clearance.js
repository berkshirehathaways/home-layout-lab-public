(() => {
  'use strict';
  const directions = [
    {key:'front',field:'clearanceFrontMm',label:'앞'},
    {key:'back',field:'clearanceBackMm',label:'뒤'},
    {key:'left',field:'clearanceLeftMm',label:'좌'},
    {key:'right',field:'clearanceRightMm',label:'우'}
  ];
  const amount = n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 10000;
  function validate(f) {
    if (!f || typeof f !== 'object' || Array.isArray(f) || !amount(f.clearanceFrontMm)) throw Error('앞쪽 사용 여유는 0~1000cm여야 합니다.');
    for (const {field} of directions.slice(1)) if (f[field] != null && !amount(f[field])) throw Error('사용 여유는 미지정 또는 0~1000cm여야 합니다.');
    if (f.clearanceBasis !== undefined && !['unspecified','user','manufacturer'].includes(f.clearanceBasis)) throw Error('사용 여유의 입력 근거가 올바르지 않습니다.');
    if (f.clearanceSource !== undefined && (typeof f.clearanceSource !== 'string' || f.clearanceSource.length > 500)) throw Error('사용 여유 출처는 500자 이하 글이어야 합니다.');
    if (f.clearanceBasis === 'manufacturer' && !f.clearanceSource?.trim()) throw Error('제조사 기준에는 확인한 문서나 출처를 입력해 주세요.');
    return f;
  }
  function zones(f,p) {
    validate(f);
    if (![f.widthMm,f.depthMm].every(n=>Number.isFinite(n)&&n>0)) return [];
    const w=f.widthMm/2,d=f.depthMm/2,a=p.rotation*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
    return directions.filter(({field})=>f[field]>0).map(({key,field,label})=>{
      const n=f[field];
      const strips = {
        front:[[-w,d],[w,d],[w,d+n],[-w,d+n]],
        back:[[-w,-d-n],[w,-d-n],[w,-d],[-w,-d]],
        left:[[-w-n,-d],[-w,-d],[-w,d],[-w-n,d]],
        right:[[w,-d],[w+n,-d],[w+n,d],[w,d]]
      };
      return {key,label,amountMm:n,points:strips[key].map(([x,y])=>[p.xMm+x*c-y*s,p.yMm+x*s+y*c])};
    });
  }
  window.HOME_CLEARANCE = {directions,validate,zones};
})();
