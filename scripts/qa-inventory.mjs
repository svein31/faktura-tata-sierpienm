import ts from 'typescript';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { applyApiRuntimeEvidence } from './audit/api-inventory-evidence.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const states = ['action', 'hover', 'focus', 'disabled', 'loading', 'error', 'empty', 'validation-empty', 'validation-invalid', 'validation-extreme', 'validation-special-Polish', 'refresh', 'back'];
const native = new Set(['a','button','input','select','textarea','form','summary','details','option']);
const custom = /(?:^|\.)(?:Link|Button|Input|Label|Select|Checkbox|Switch|Tabs|Tab|Dialog|Modal|Tooltip|Dropdown|Menu|Popover|Command|Combobox)(?:[A-Z].*)?$/;
const compact = value => value.replace(/\s+/g, ' ').trim().slice(0, 220);
async function revision() {
  const gitDirectory=path.join(root,'.git');
  const head=(await readFile(path.join(gitDirectory,'HEAD'),'utf8')).trim();
  if(!head.startsWith('ref: '))return head;
  const ref=head.slice(5);
  if(existsSync(path.join(gitDirectory,ref)))return (await readFile(path.join(gitDirectory,ref),'utf8')).trim();
  return (await readFile(path.join(gitDirectory,'packed-refs'),'utf8')).split('\n').find(line=>line.endsWith(' '+ref))?.split(' ')[0] || 'unavailable';
}

async function filesBelow(directory,codeOnly=true) {
  if (!existsSync(directory)) return [];
  const result = [];
  for (const entry of await readdir(directory, {withFileTypes:true})) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await filesBelow(filename,codeOnly));
    else if (!codeOnly || /\.(?:tsx?|jsx?|mjs)$/.test(entry.name)) result.push(filename);
  }
  return result.sort();
}
export async function sourceFingerprint() {
  const files=[...await filesBelow(path.join(root,'src'),false),...await filesBelow(path.join(root,'lib'),false),...await filesBelow(path.join(root,'public'),false),...await filesBelow(path.join(root,'netlify'),false),...['prisma/schema.prisma','app.js','netlify.toml','next.config.mjs','postcss.config.mjs','tailwind.config.ts','tailwind.config.js','tailwind-compat.config.cjs','package.json','package-lock.json'].map(file=>path.join(root,file)).filter(existsSync)].sort();
  const hash=createHash('sha256');
  for(const file of files)hash.update(path.relative(root,file).replaceAll('\\','/')+'\0').update(await readFile(file)).update('\0');
  return hash.digest('hex');
}
function routeFromFile(filename) {
  return '/' + filename.replace(/^src\/app\//, '').replace(/\/(?:page|route)\.[jt]sx?$/, '').replace(/^(?:page|route)\.[jt]sx?$/, '').split('/').filter(segment => segment && !segment.startsWith('(') && !segment.startsWith('@')).join('/');
}
function parse(filename, source) {return ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, filename.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);}
export async function collectPublicRoutePaths() {
  // Read literal topic definitions, including comparison spread definitions. Do
  // not import server application code or evaluate user-provided expressions.
  const topics = new Set();
  for (const file of ['src/lib/seo/content.ts','src/lib/seo/comparisons.ts']) {
    const source = await readFile(path.join(root,file),'utf8'), tree = parse(file,source);
    const visit = node => {
      if (ts.isPropertyAssignment(node) && node.name.getText(tree).replace(/["']/g,'') === 'path' && ts.isStringLiteral(node.initializer)) topics.add(node.initializer.text);
      ts.forEachChild(node,visit);
    }; visit(tree);
  }
  const pages = (await filesBelow(path.join(root,'src/app'))).filter(file => /\/page\.[jt]sx?$/.test(file));
  const routes = new Set(topics);
  for (const file of pages) {
    const relative = path.relative(root,file).replaceAll('\\','/');
    if (relative.includes('/(app)/')) continue;
    const route = routeFromFile(relative);
    if (!route.includes('[')) routes.add(route);
  }
  return [...routes].sort();
}
export async function buildInventory() {
  const files = [...await filesBelow(path.join(root,'src')), ...await filesBelow(path.join(root,'lib'))].sort();
  const sourceMap = new Map(), imports = new Map(), components = [], controls = [], pages = [], api = [], publicHttpRoutes=[], specialViews=[];
  for (const absolute of files) {
    const file = path.relative(root,absolute).replaceAll('\\','/'), source = await readFile(absolute,'utf8');
    sourceMap.set(file,source);
  }
  const resolveImport = (owner,specifier) => {
    if (!specifier.startsWith('.') && !specifier.startsWith('@/')) return undefined;
    const target = specifier.startsWith('@/') ? 'src/'+specifier.slice(2) : path.posix.normalize(path.posix.join(path.posix.dirname(owner),specifier));
    return [target,...['.ts','.tsx','.js','.jsx','/index.ts','/index.tsx'].map(extension=>target+extension)].find(candidate=>sourceMap.has(candidate));
  };
  for (const [file,source] of sourceMap) {
    const tree=parse(file,source), dependencies=new Set();
    const visit=node=>{
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const dependency=resolveImport(file,node.moduleSpecifier.text); if(dependency)dependencies.add(dependency);
      }
      if (ts.isCallExpression(node) && node.expression.kind===ts.SyntaxKind.ImportKeyword && ts.isStringLiteral(node.arguments[0])) {
        const dependency=resolveImport(file,node.arguments[0].text); if(dependency)dependencies.add(dependency);
      }
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tag=node.tagName.getText(tree), line=tree.getLineAndCharacterOfPosition(node.getStart(tree)).line+1;
        const attributes=Object.fromEntries(node.attributes.properties.filter(ts.isJsxAttribute).map(attribute=>[attribute.name.getText(tree),attribute.initializer ? compact(attribute.initializer.getText(tree)) : true]));
        if(native.has(tag) || custom.test(tag) || Object.keys(attributes).some(attribute=>['onClick','onSubmit','onChange','tabIndex','role','title','aria-describedby'].includes(attribute))) {
          const label=attributes['aria-label'] || attributes.title || attributes.name || attributes.id || (ts.isJsxOpeningElement(node) ? compact(node.parent.children.map(child=>child.getText(tree)).join(' ')) : '');
          const literalAttribute=name=>{
            const attribute=node.attributes.properties.find(attribute=>ts.isJsxAttribute(attribute) && attribute.name.getText(tree)===name);
            if(attribute?.initializer && ts.isStringLiteral(attribute.initializer))return attribute.initializer.text;
            if(attribute?.initializer && ts.isJsxExpression(attribute.initializer) && attribute.initializer.expression && ts.isStringLiteral(attribute.initializer.expression))return attribute.initializer.expression.text;
          };
          const literalChildren=ts.isJsxOpeningElement(node) ? node.parent.children.filter(ts.isJsxText).map(child=>child.text).join(' ') : '';
          const staticName=compact(literalAttribute('aria-label') || literalAttribute('title') || literalChildren);
          controls.push({id:`${file}:${line}:${node.getStart(tree)}`,file,line,tag,label,staticName:staticName || undefined,attributes,classification:native.has(tag)?'native-control-template':'component-or-interactive-template',status:'source-discovered',states:Object.fromEntries(states.map(state=>[state,'unverified'])),routes:[]});
        }
      }
      ts.forEachChild(node,visit);
    };visit(tree);imports.set(file,dependencies);
    if(file.startsWith('src/components/'))components.push({file,classification:file.endsWith('.tsx')?'react-component-source':'component-support-module',status:'source-discovered',controlTemplates:controls.filter(control=>control.file===file).length,routes:[]});
    if(/^src\/app\/.*(?:not-found|error|loading|global-error)\.tsx$/.test(file))specialViews.push({file,kind:path.posix.basename(file,'.tsx'),status:'source-discovered',checks:{render:'unverified',recovery:'unverified',keyboard:'unverified',responsive:'unverified'}});
    if(/^src\/app\/.*page\.[jt]sx?$/.test(file))pages.push({route:routeFromFile(file),file,protected:file.includes('/(app)/'),dynamic:routeFromFile(file).includes('['),status:'source-discovered',validPaths:[],unverifiedScenarios:['invalid-or-expired-token','empty','error','loading','browser-history','refresh']});
    if(/^src\/app\/.*route\.[jt]sx?$/.test(file)) {
      const methods=new Set();
      for(const statement of tree.statements) {
        if(ts.isFunctionDeclaration(statement) && statement.modifiers?.some(modifier=>modifier.kind===ts.SyntaxKind.ExportKeyword) && /^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)$/.test(statement.name?.text || ''))methods.add(statement.name.text);
        if(ts.isVariableStatement(statement) && statement.modifiers?.some(modifier=>modifier.kind===ts.SyntaxKind.ExportKeyword))for(const declaration of statement.declarationList.declarations)if(/^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)$/.test(declaration.name.getText(tree)))methods.add(declaration.name.getText(tree));
        if(ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause))for(const element of statement.exportClause.elements)if(/^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)$/.test(element.name.text))methods.add(element.name.text);
      }
      const handler={route:routeFromFile(file),file,methods:[...methods].sort(),status:'source-discovered',checks:Object.fromEntries(['authorized','unauthorized','cross-tenant','csrf','invalid-json','extreme-input','success','failure'].map(check=>[check,'unverified']))};
      (file.startsWith('src/app/api/')?api:publicHttpRoutes).push(handler);
    }
  }
  const publicPaths=await collectPublicRoutePaths();
  const appLayouts=[...sourceMap.keys()].filter(file=>/^src\/app\/.*layout\.tsx$/.test(file));
  const closure=(file,visited=new Set())=>{if(visited.has(file))return visited;visited.add(file);for(const dependency of imports.get(file)||[])closure(dependency,visited);return visited;};
  for(const page of pages) {
    page.validPaths=page.dynamic ? publicPaths.filter(route=>{const matcher='^'+page.route.replace(/\[\.\.\.[^\]]+\]/g,'.+').replace(/\[[^\]]+\]/g,'[^/]+')+'$';return new RegExp(matcher).test(route);}) : [page.route];
    if(page.route==='/invoices/[id]')page.fixture='isolated database invoice';
    if(page.route==='/portal/[token]')page.fixture='isolated invoice share token and offer public token';
    if(page.route==='/invite/[token]')page.fixture='isolated pending team invitation';
    const reachable=closure(page.file);
    for(const layout of appLayouts) {
      const directory=path.posix.dirname(layout);
      if(page.file.startsWith(directory+'/'))closure(layout,reachable);
    }
    for(const component of components)if(reachable.has(component.file))component.routes.push(page.route);
    for(const control of controls)if(reachable.has(control.file))control.routes.push(page.route);
  }
  const metadataRoutes=[['/robots.txt','src/app/robots.ts'],['/sitemap.xml','src/app/sitemap.ts'],['/manifest.webmanifest','src/app/manifest.ts'],['/opengraph-image','src/app/opengraph-image.tsx'],['/icon.svg','src/app/icon.svg']].filter(([,file])=>existsSync(path.join(root,file))).map(([route,file])=>({route,file,methods:['GET'],status:'source-discovered'}));
  return {schemaVersion:1,auditDate:'2026-10-08',revision:await revision(),sourceSha256:await sourceFingerprint(),scope:{productionMutations:false,sourceInventoryIsNotRuntimeVerification:true,conditionalAndRepeatedControls:'Each JSX template is listed once; conditional/loop instances require live observations and explicit interaction evidence.',states},totals:{pageRoutePatterns:pages.length,publicValidPaths:publicPaths.length,apiRoutePatterns:api.length,apiMethods:api.reduce((sum,route)=>sum+route.methods.length,0),publicHttpRoutes:publicHttpRoutes.length,metadataRoutes:metadataRoutes.length,specialViews:specialViews.length,componentFiles:components.length,controlTemplates:controls.length},publicPaths,pages,api,publicHttpRoutes,metadataRoutes,specialViews,routingSources:['src/middleware.ts','next.config.mjs','netlify.toml'].filter(file=>existsSync(path.join(root,file))),components,controls};
}
function applyRuntimeEvidence(inventory,report,currentBuildId) {
  if(report.sourceSha256!==inventory.sourceSha256 || !report.buildId || report.buildId!==currentBuildId)return {status:'ignored-stale-or-unidentified-report',expectedSourceSha256:inventory.sourceSha256,receivedSourceSha256:report.sourceSha256 || null,expectedBuildId:currentBuildId || null,receivedBuildId:report.buildId || null};
  let observed=0,focusChecked=0;
  const semanticTag=tag=>({Button:'button',Input:'input',Link:'a',Select:'combobox',Dialog:'dialog',Tooltip:'tooltip'}[tag] || tag.toLowerCase());
  const pageFor=url=>inventory.pages.find(page=>page.validPaths.includes(url)) || inventory.pages.find(page=>page.dynamic && new RegExp('^'+page.route.replace(/\[\.\.\.[^\]]+\]/g,'.+').replace(/\[[^\]]+\]/g,'[^/]+')+'$').test(url));
  for(const observation of report.observations || []) {
    const page=pageFor(observation.url);if(!page)continue;
    for(const live of observation.controls) {
      const candidates=inventory.controls.filter(control=>control.staticName && control.staticName===live.label && control.routes.includes(page.route) && [live.tag,live.role].includes(semanticTag(control.tag)));
      // Dynamic/ambiguous source names deliberately remain unverified. A label
      // match cannot prove that an unrelated conditional control was exercised.
      if(candidates.length!==1)continue;
      const control=candidates[0];
      control.status='source-and-runtime-observed';
      control.runtimeEvidence ??= {observations:0,engines:[],viewports:[],routes:[],states:{}};
      const evidence=control.runtimeEvidence;evidence.observations++;observed++;
      if(!evidence.engines.includes(observation.engine))evidence.engines.push(observation.engine);
      const viewport=`${observation.viewport.width}x${observation.viewport.height}`;
      if(!evidence.viewports.includes(viewport))evidence.viewports.push(viewport);
      if(!evidence.routes.includes(observation.url))evidence.routes.push(observation.url);
      if(live.states.focus==='checked-programmatic-focus') {control.states.focus='checked-runtime-programmatic-focus';evidence.states.focus='programmatic focus only; keyboard and visual ring require separate proof';focusChecked++;}
      if(live.disabled)evidence.states.disabled='observed-disabled; action blocking not inferred';
      if(live.states.loading==='observed-loading')evidence.states.loading='observed-loading; resolution not inferred';
    }
    page.runtimeEvidence ??= {engines:[],viewports:[],observations:0};
    page.runtimeEvidence.observations++;
    if(!page.runtimeEvidence.engines.includes(observation.engine))page.runtimeEvidence.engines.push(observation.engine);
    const viewport=`${observation.viewport.width}x${observation.viewport.height}`;
    if(!page.runtimeEvidence.viewports.includes(viewport))page.runtimeEvidence.viewports.push(viewport);
  }
  const explicit=[
    ['login-password-visibility-keyboard','src/app/login/page.tsx','Pokaż hasło',['action','focus']],
    ['404-recovery-link','src/app/not-found.tsx','Strona główna',['action']],
    ['bootstrap-503-error-and-retry','src/components/layout/data-bootstrap.tsx','Spróbuj ponownie',['action','error']],
  ];
  for(const [scenario,file,name,checkedStates]of explicit) {
    const results=(report.scenarios || []).filter(result=>result.name===scenario && result.status==='checked');
    const candidates=inventory.controls.filter(control=>control.file===file && control.staticName===name);
    if(!results.length || candidates.length!==1)continue;
    const control=candidates[0];control.status='source-and-runtime-checked';
    control.scenarioEvidence=results.map(result=>({engine:result.engine,name:result.name,status:result.status}));
    for(const state of checkedStates)control.states[state]='checked-explicit-browser-scenario';
  }
  return {status:'applied-exact-unambiguous-matches',buildId:report.buildId,matchedObservations:observed,focusObservations:focusChecked,templatesObserved:inventory.controls.filter(control=>control.runtimeEvidence).length,templatesWithExplicitActions:inventory.controls.filter(control=>control.states.action!=='unverified').length,checkedScenarioRecords:(report.scenarios || []).length};
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const inventory=await buildInventory(), destination=path.join(root,'docs/audit/2026-10-08');
  const currentBuildId=await readFile(path.join(root,'.next/BUILD_ID'),'utf8').then(value=>value.trim()).catch(()=>null);
  const runtimeOption=process.argv.indexOf('--runtime');
  const runtimeFile=runtimeOption>=0?process.argv[runtimeOption+1]:path.join(root,'artifacts/audit/browser-coverage.json');
  if(runtimeFile && existsSync(runtimeFile))inventory.runtimeCoverage=applyRuntimeEvidence(inventory,JSON.parse(await readFile(runtimeFile,'utf8')),currentBuildId);
  const apiRuntimeOption=process.argv.indexOf('--api-runtime');
  const apiRuntimeFile=apiRuntimeOption>=0?process.argv[apiRuntimeOption+1]:path.join(root,'artifacts/functional/http-audit.json');
  if(apiRuntimeFile && existsSync(apiRuntimeFile))inventory.apiRuntimeCoverage=applyApiRuntimeEvidence(inventory,JSON.parse(await readFile(apiRuntimeFile,'utf8')),currentBuildId);
  await mkdir(destination,{recursive:true});
  await writeFile(path.join(destination,'inventory.json'),JSON.stringify(inventory,null,2)+'\n');
  const summary=`# Zakres audytu 2026-10-08\n\nGenerowanie: \`node scripts/qa-inventory.mjs\`. Wersja źródeł: \`${inventory.revision}\`; SHA-256 zawartości: \`${inventory.sourceSha256}\`. Po zmianach trzeba wygenerować ponownie.\n\n| Obiekt | Liczba | Status samego spisu |\n|---|---:|---|\n| Wzorce stron | ${inventory.totals.pageRoutePatterns} | odkryte w źródłach |\n| Konkretne publiczne ścieżki, wszystkie slugi | ${inventory.totals.publicValidPaths} | odkryte w źródłach |\n| Wzorce API | ${inventory.totals.apiRoutePatterns} | odkryte w źródłach |\n| Metody API | ${inventory.totals.apiMethods} | odkryte w źródłach |\n| Pliki komponentów | ${inventory.totals.componentFiles} | odkryte w źródłach |\n| Szablony mikroelementów UI | ${inventory.totals.controlTemplates} | odkryte w źródłach |\n\nKażdy szablon ma lokalizację plik/wiersz, atrybuty, powiązane strony i osobne statusy akcji, hover, focus, disabled, loading, error, empty, walidacji, odświeżenia i wstecz. Status \`source-discovered\` ani obecność atrybutu nie oznacza poprawnego działania. Wszystkie niewykonane kontrole pozostają \`unverified\`. Pętle oraz warunki JSX wymagają osobnych żywych obserwacji; sam spis nie dowodzi przeklikania wszystkich wariantów.\n\nAudyt przeglądarkowy zapisuje osobny raport \`artifacts/audit/browser-coverage.json\`: rzeczywiście odwiedzone ścieżki, silniki, rozmiary ekranu, widoczne kontrolki i wykonane kontrole. Nie wpisuje sukcesu dla nieklikniętych działań. Aktualizacja raportu po zmianie kodu wymaga ponownego przebiegu. Raport produkcyjny jest osobny: lokalna baza i odcięte integracje nie dowodzą działania Netlify, prawdziwej poczty, Stripe, MF/KSeF, GUS, VIES ani NBP.\n\nTrasy z identyfikatorem/tokenem wymagają prawidłowych izolowanych danych: faktura, portal faktury/oferty i zaproszenie. Nieprawidłowe/wygasłe tokeny oraz 404 są odrębnymi przypadkami. Testy destrukcyjne wolno wykonywać wyłącznie na izolowanej bazie testowej.\n`;
  const additional=`\nSpis obejmuje także ${inventory.totals.publicHttpRoutes} publiczną trasę HTTP poza API, ${inventory.totals.metadataRoutes} tras metadanych, ${inventory.totals.specialViews} widoki systemowe oraz źródła middleware/konfiguracji routingu. Pliki pomocnicze komponentów są oznaczone osobno od JSX.\n\nPo pełnym przebiegu uruchom \`node scripts/qa-inventory.mjs --runtime artifacts/audit/browser-coverage.json\`. Uzupełnienie wymaga zgodnego SHA-256 źródeł, stylów, zasobów, schematu oraz konfiguracji/dependencji. Dopasowanie DOM do JSX stosuje tylko dokładną, jednoznaczną nazwę i typ kontrolki w osiągalnych źródłach danej strony. Nie przenosi sukcesu na podobny przycisk lub niewidoczny wariant. Programmatic focus jest odrębny od klawiatury i wyglądu obramowania. Obserwacja disabled/loading nie dowodzi prawidłowego zakończenia działania. Wyniki komponentów syntetycznych mają osobny zakres i nie zastępują rzeczywistych operacji aplikacji.\n${inventory.runtimeCoverage?`\nUzupełnienie z przebiegu: \`${inventory.runtimeCoverage.status}\`. ${JSON.stringify(inventory.runtimeCoverage)}\n`:''}`;
  const apiAdditional=`\nDowody API: \`--api-runtime artifacts/functional/http-audit.json\` (domyślny plik). Wymagają zgodnego hasha źródeł, identyfikatora builda i katalogu metod. Każdy dowód jest przypisany do dokładnej metody i ścieżki; literalna trasa ma pierwszeństwo przed parametrem. Test ogólny \`HTTP < 500\` jest wyłącznie obserwacją smoke, nie potwierdza autoryzacji ani powodzenia operacji. Sprawdzone kategorie oznaczają wyłącznie jawnie podane przypadki/statusy, nie wszystkie warianty endpointu.\n${inventory.apiRuntimeCoverage?`\nUzupełnienie API: \`${inventory.apiRuntimeCoverage.status}\`. ${JSON.stringify(inventory.apiRuntimeCoverage)}\n`:''}`;
  await writeFile(path.join(destination,'coverage.md'),summary+additional+apiAdditional);
  console.log(JSON.stringify(inventory.totals));
}
