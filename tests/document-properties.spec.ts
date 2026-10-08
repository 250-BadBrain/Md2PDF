import { test, expect } from '@playwright/test';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

test('downloaded PDFs preserve Unicode properties and selected heading ancestry with remapped destinations', async ({page}) => {
  await page.goto('/');
  const bytes=await page.evaluate(async () => {
    const {renderMarkdownToHtml}=await import('/src/markdown.ts');
    const {paginateHtml}=await import('/src/pagination.ts');
    const {renderImagePdf}=await import('/src/export.ts');
    const source='---\ntitle: 中文报告 😀\nauthor: 读者\nsubject: 文档属性测试\nkeywords: [数学, PDF, 测试]\ncover: true\n---\n[TOC]\n\n# 第一章 😀\n\n## 保留子节\n\n[跳过](#第二章) [保留](#末章子节)\n\n[pagebreak]\n\n# 第二章\n\n正文\n\n[pagebreak]\n\n### 孤立深层节\n\n正文\n\n[pagebreak]\n\n# 第三章\n\n正文\n\n[pagebreak]\n\n## 末章子节\n\n#### 保留深层节\n\n正文';
    const output=await renderMarkdownToHtml(source,undefined,{});
    const pages=await paginateHtml(output.html,output.meta);
    const selected=pages.filter(html=>{
      const wrapper=document.createElement('div');wrapper.innerHTML=html;
      return wrapper.querySelector('#第一章,#孤立深层节,#末章子节')!==null;
    });
    const pdf=await renderImagePdf(selected,output.meta,{quality:'small',originalPages:pages});
    return [...new Uint8Array(await pdf.arrayBuffer())];
  });
  const task=getDocument({data:new Uint8Array(bytes)});
  try {
    const pdf=await task.promise;
    expect(pdf.numPages).toBe(3);
    expect((await pdf.getMetadata()).info).toMatchObject({Title:'中文报告 😀',Author:'读者',Subject:'文档属性测试',Keywords:'数学, PDF, 测试',Creator:'Md2PDF'});
    const outline=(await pdf.getOutline())!;
    expect(outline.map(item=>item.title)).toEqual(['第一章 😀','孤立深层节','末章子节']);
    expect(outline[0].items.map(item=>item.title)).toEqual(['保留子节']);
    expect(outline[1].items).toHaveLength(0);
    expect(outline[2].items.map(item=>item.title)).toEqual(['保留深层节']);
    expect(await Promise.all(outline.map(item=>pdf.getPageIndex((item.dest as unknown[])[0] as {num:number;gen:number})))).toEqual([0,1,2]);
    const links=await (await pdf.getPage(1)).getAnnotations();
    const destinations=await Promise.all(links.filter(link=>link.dest).map(link=>pdf.getPageIndex(link.dest[0])));
    expect(destinations).toContain(2);
    expect(destinations.every(index=>index>=0&&index<pdf.numPages)).toBe(true);
  } finally { await task.destroy(); }
});

test('the document properties panel updates front matter and persists with the Markdown draft', async ({page}) => {
  await page.goto('/');
  const editor=page.getByRole('textbox',{name:'Markdown 源代码编辑区'});
  await editor.fill('---\npaper: A5 # keep\ncover: false\n---\n# Body\n\n正文');
  await page.getByRole('button',{name:'文档属性',exact:true}).click();
  await page.getByLabel('文档标题',{exact:true}).fill('项目标题 😀');
  await page.getByLabel('文档作者',{exact:true}).fill('作者');
  await page.getByLabel('文档主题',{exact:true}).fill('项目说明');
  await page.getByLabel('文档关键词',{exact:true}).fill('PDF\n文档');
  await page.getByRole('button',{name:'保存文档属性',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'文档属性已保存'})).toBeVisible();
  const saved=await editor.inputValue();
  expect(saved).toContain('paper: A5 # keep');expect(saved).toContain('cover: false');expect(saved.endsWith('# Body\n\n正文')).toBe(true);
  await page.getByRole('button',{name:'关闭文档属性',exact:true}).click();
  await expect(page.getByRole('button',{name:'文档属性',exact:true})).toBeFocused();
  await expect.poll(()=>page.evaluate(()=>localStorage.getItem('md2pdf:draft:v1')||'')).toContain('项目标题');
  await page.reload();
  await expect(editor).toHaveValue(saved);
  await page.getByRole('button',{name:'文档属性',exact:true}).click();
  await expect(page.getByLabel('文档关键词',{exact:true})).toHaveValue('PDF\n文档');
  await page.keyboard.press('Escape');
  await editor.fill('---\ntitle: [invalid\n---\n# Keep');
  await page.getByRole('button',{name:'文档属性',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('YAML');
  await expect(page.getByRole('button',{name:'保存文档属性',exact:true})).toBeDisabled();
  await expect(editor).toHaveValue('---\ntitle: [invalid\n---\n# Keep');
});

test('partial print exports retain selected anchors and disable destinations outside the export', async ({page}) => {
  await page.goto('/');
  const result=await page.evaluate(async () => {
    const descriptor=Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype,'contentWindow')!;
    Object.defineProperty(HTMLIFrameElement.prototype,'contentWindow',{get(){const win=descriptor.get!.call(this);if(win)win.print=()=>{};return win;}});
    const {printPages}=await import('/src/export.ts');
    await printPages(['<div class="pdf-content"><h1 id="中文">Heading</h1><a href="#%E4%B8%AD%E6%96%87">Selected</a><a href="#missing" class="keep">Missing</a><a href="https://example.com">External</a></div>'],{title:'Test'});
    const wrapper=document.createElement('div');wrapper.innerHTML=document.querySelector('iframe')!.srcdoc;
    return [...wrapper.querySelectorAll('a')].map(link=>({title:link.textContent,href:link.getAttribute('href'),class:link.className}));
  });
  expect(result).toEqual([{title:'Selected',href:'#%E4%B8%AD%E6%96%87',class:''},{title:'Missing',href:null,class:'keep'},{title:'External',href:'https://example.com',class:''}]);
});

test('mixed paper-size bookmarks and links use their own destination pages independently of the last page height', async ({page}) => {
  await page.goto('/');
  const result=await page.evaluate(async () => {
    const {paginateHtml}=await import('/src/pagination.ts');
    const {renderImagePdf}=await import('/src/export.ts');
    const portrait=await paginateHtml('<h1 id="portrait">Portrait</h1><p>First <a href="#portrait">Portrait</a> <a href="#landscape">Landscape</a></p>',{paper:'A4'});
    const landscape=await paginateHtml('<h1 id="landscape">Landscape</h1><p>Second <a href="#portrait">Portrait</a></p>',{paper:'A5',orientation:'landscape'});
    await document.fonts.ready;
    const expected: number[]=[];
    for (const [html,height,id] of [[portrait[0],297,'portrait'],[landscape[0],148,'landscape']] as const) {
      const host=document.createElement('div');host.className='pdf-export-host';
      const section=document.createElement('section');section.className='pdf-document pdf-document-export';section.style.width='210mm';
      const article=document.createElement('article');article.className='pdf-page pdf-page-export';article.style.width='210mm';article.style.height=`${height}mm`;article.innerHTML=html;
      section.append(article);host.append(section);document.body.append(host);
      const bounds=article.getBoundingClientRect(),target=article.querySelector(`#${id}`)!.getBoundingClientRect();
      expected.push((height-(target.top-bounds.top)*height/bounds.height)*72/25.4);
      host.remove();
    }
    const pdf=await renderImagePdf([...portrait,...landscape],{},{quality:'small'});
    return {bytes:[...new Uint8Array(await pdf.arrayBuffer())],expected};
  });
  const task=getDocument({data:new Uint8Array(result.bytes)});
  try {
    const pdf=await task.promise;
    const first=(await pdf.getPage(1)).getViewport({scale:1}),second=(await pdf.getPage(2)).getViewport({scale:1});
    expect(first.width).toBeCloseTo(210*72/25.4,1);expect(first.height).toBeCloseTo(297*72/25.4,1);
    expect(second.width).toBeCloseTo(210*72/25.4,1);expect(second.height).toBeCloseTo(148*72/25.4,1);
    const outline=(await pdf.getOutline())!;
    expect(outline.map(item=>item.title)).toEqual(['Portrait','Landscape']);
    const destinations=outline.map(item=>item.dest as [{num:number;gen:number},{name:string}]);
    expect(await Promise.all(destinations.map(dest=>pdf.getPageIndex(dest[0])))).toEqual([0,1]);
    expect(destinations.map(dest=>dest[1].name)).toEqual(['Fit','Fit']);
    expect(destinations.map(dest=>dest.length)).toEqual([2,2]);
    const firstLinks=(await (await pdf.getPage(1)).getAnnotations()).filter(annotation=>annotation.dest);
    const lastLinks=(await (await pdf.getPage(2)).getAnnotations()).filter(annotation=>annotation.dest);
    expect(firstLinks).toHaveLength(2);expect(lastLinks).toHaveLength(1);
    for(const link of [...firstLinks,...lastLinks]) {
      const destination=link.dest as [{num:number;gen:number},{name:string},number];
      const targetIndex=await pdf.getPageIndex(destination[0]);
      expect(destination[1].name).toBe('FitH');
      expect(destination[2]).toBeCloseTo(result.expected[targetIndex],3);
    }
  } finally {await task.destroy();}
});

test('selected identical pages retain anonymous heading ancestry using their original indices', async ({page}) => {
  await page.goto('/');
  const bytes=await page.evaluate(async () => {
    const {paginateHtml}=await import('/src/pagination.ts');
    const {renderImagePdf}=await import('/src/export.ts');
    const first=await paginateHtml('<h1 id="a">Chapter A</h1>',{});
    const second=await paginateHtml('<h1 id="b">Chapter B</h1>',{});
    const section=await paginateHtml('<h2>Section</h2>',{});
    const original=[first[0],section[0],second[0],section[0]];
    const pdf=await renderImagePdf([original[0],original[3]],{},{quality:'small',originalPages:original,originalPageIndices:[0,3]});
    return [...new Uint8Array(await pdf.arrayBuffer())];
  });
  const task=getDocument({data:new Uint8Array(bytes)});
  try {
    const pdf=await task.promise;
    const outline=(await pdf.getOutline())!;
    expect(outline.map(item=>item.title)).toEqual(['Chapter A','Section']);
    expect(outline[0].items).toHaveLength(0);
    expect(await pdf.getPageIndex((outline[1].dest as [{num:number;gen:number}])[0])).toBe(1);
  } finally {await task.destroy();}
});
