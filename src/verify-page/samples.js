// Samples for the verification page, spec-draft §2-4.
// The CONTENT is the orchestrator's (§2-5 left it open), not 상철님's. It mixes lists, attributes and nesting so
// the later diff cases (text change, attribute change, add/remove child, reorder, tag change) have something to bite.
// Spec §2-5 (after the diff grill): sample 1's list items carry keys (§3-2 key pairing, "c를 맨 앞으로" shows as one
// move); sample 2's lists have none, so 양 끝 잘라내기 / pairing by index can be seen there.

export const SAMPLES = [
  {
    name: '샘플 1',
    html: `<section class="card" id="todo">
  <h2>오늘 할 일</h2>
  <ul class="list">
    <li key="vdom">VDOM 노드 정하기</li>
    <li key="page" class="done">검증 페이지 만들기</li>
    <li key="diff">diff <b>5가지 경우</b> 정리하기</li>
  </ul>
  <p>링크: <a href="https://github.com/Shirokuma0704/mini-react" title="저장소">mini-react</a></p>
</section>`,
  },
  {
    name: '샘플 2',
    html: `<article class="post">
  <header>
    <h1>미니 React 일지</h1>
    <p class="meta">11-09 · <span class="tag">VDOM</span> <span class="tag">diff</span></p>
  </header>
  <ol start="1">
    <li>실제 DOM을 <code>domToVdom</code>으로 바꾸기</li>
    <li>두 VDOM을 비교하기
      <ul>
        <li>글자가 바뀜</li>
        <li>속성이 바뀜</li>
      </ul>
    </li>
    <li>바뀐 곳만 <em>patch</em>하기</li>
  </ol>
  <hr class="divider">
  <p>끝<br>다음은 hooks</p>
</article>`,
  },
];
