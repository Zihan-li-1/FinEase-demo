import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source=readFileSync('src/lib/theme.ts','utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function environment(value, blocked=false) {
  const values=new Map(value===undefined?[]:[['finease.theme',value]]);
  const context=vm.createContext({exports:{},document:{documentElement:{dataset:{}}},localStorage:{
    getItem:key=>{if(blocked)throw Error('storage denied');return values.get(key)??null;},
    setItem:(key,value)=>{if(blocked)throw Error('storage denied');values.set(key,value);}
  }});
  vm.runInContext(compiled,context);vm.runInContext(context.exports.themeBootstrap,context);
  return {context,values};
}
for(const [value,expected] of [[undefined,'dark'],['light','light'],['dark','dark'],['system','dark'],['','dark']]) {
  test(`bootstrap preference ${String(value)} -> ${expected}, without overwriting storage`,()=>{
    const {context,values}=environment(value);
    assert.equal(context.document.documentElement.dataset.theme,expected);
    assert.equal(values.get('finease.theme'),value);
  });
}
test('blocked storage defaults dark, explicit choice works in memory',()=>{
  const {context}=environment(undefined,true);
  assert.equal(context.exports.currentTheme(),'dark');context.exports.selectTheme('light');
  assert.equal(context.exports.currentTheme(),'light');
});
test('explicit choices persist under the same preference key',()=>{
  const {context,values}=environment();context.exports.selectTheme('light');
  assert.equal(values.get('finease.theme'),'light');context.exports.selectTheme('dark');
  assert.equal(values.get('finease.theme'),'dark');
});
