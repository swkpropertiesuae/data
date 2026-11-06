// RFC 4180 parser: preserves quoted commas, escaped quotes and embedded newlines.
export function parseCSV(text){
  const rows=[];let row=[],field='',quoted=false;
  text=String(text).replace(/^\uFEFF/,'');
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}
    else if(c===','&&!quoted){row.push(field);field='';}
    else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(v=>v!==''))rows.push(row);row=[];field='';}
    else field+=c;
  }
  if(field!==''||row.length){row.push(field);rows.push(row);}
  return rows;
}
export function csvObjects(text){const [headers,...rows]=parseCSV(text);if(!headers)return [];return rows.map(row=>Object.fromEntries(headers.map((k,i)=>[k,row[i]??''])));}
export function csvEscape(v){return '"'+String(v??'').replaceAll('"','""')+'"';}
export function csvExport(rows,columns){return '\uFEFF'+[columns.map(csvEscape).join(','),...rows.map(r=>columns.map(k=>{let v=r[k]??'';if(typeof v==='string'&&/^[=+@\-\t\r]/.test(v))v="'"+v;return csvEscape(v);}).join(','))].join('\r\n');}
