require('../register-ts.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { PRODUCT_ANSWERS, ProductAnswers } = require('../../src/components/landing/product-answers.tsx');
const { SUBSCRIPTION_PLANS } = require('../../src/lib/subscription-plans.ts');

test('landing questions and answers are present without client JavaScript and match FAQ JSON-LD', () => {
  const html = renderToStaticMarkup(React.createElement(ProductAnswers));
  const json = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  assert.equal(json['@type'],'FAQPage');
  assert.equal(json.mainEntity.length,PRODUCT_ANSWERS.length);
  assert.equal((html.match(/<details /g)||[]).length,PRODUCT_ANSWERS.length);
  for (let index=0;index<PRODUCT_ANSWERS.length;index++) {
    const item=PRODUCT_ANSWERS[index];
    assert.equal(json.mainEntity[index].name,item.question);
    assert.equal(json.mainEntity[index].acceptedAnswer.text,item.answer);
    assert.ok(html.includes(item.answer));
    assert.ok(html.includes(`href="${item.href}"`));
  }
  assert.ok(html.includes('program do faktury'));
  assert.ok(html.includes('faktury prosto'));
  assert.doesNotMatch(JSON.stringify(json),/aggregateRating|reviewRating|LocalBusiness/);
});

test('landing price answer follows shared plans and discloses Free limit and renewal', () => {
  const answer=PRODUCT_ANSWERS.find(item=>item.question.includes('darmowy')).answer;
  assert.match(answer,/do 5 faktur miesięcznie/);
  for(const plan of SUBSCRIPTION_PLANS)assert.ok(answer.includes(`${plan.amountPln} zł brutto`));
  assert.match(answer,/automatycznym odnowieniem/);
});
