'use strict';

const structureTemplate = `
<section class="title">
  <h1 id="title">{{ title }}</h1>
  <p id="date">{{ date }}</p>
</section>

<br/>

<section class="mainContent">

  <h3>On this Day in History</h3>
    <p id="dayInHistoryHead">{{ dayInHistoryHead }}</p>
    <p id="dayInHistoryBody">{{ dayInHistoryBody }}</p>
    <p id="dayInHistoryYear">{{ dayInHistoryYear }}</p>

    <br/>
</section>`;

exports.structure_template = structureTemplate;
