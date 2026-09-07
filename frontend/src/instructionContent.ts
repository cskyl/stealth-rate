import { h } from "./dom";

type Translate = (key: string) => string;

export function renderInstructionGuide(t: Translate, real = false, v2 = false): HTMLElement {
  const zh = t("yes") === "是";
  const realCopy = zh ? {
    lead: "这是一次真实视频内部试点。请判断你是否注意到片段中添加或修改的内容，并如实报告感受。",
    watch: "观看：以舒适音量完整播放片段；耳机为建议而非要求。",
    answer: "回答：选择是否注意到修改内容、注意到的形式，并完成明显程度、自然程度和信心评分。",
    submit: "提交：检查所有选择后提交。练习和正式片段都不提供答案。",
  } : {
    lead: "This is an internal pilot using real videos. Report whether you noticed " +
      "added or modified content and describe your impression honestly.",
    watch: "Watch: play the full clip at a comfortable volume; headphones are " +
      "recommended, not required.",
    answer: "Answer: select whether you noticed modified content, what form you noticed, " +
      "and rate conspicuousness, naturalness, and confidence.",
    submit: "Submit: check every selection before submitting. No answer is provided " +
      "for practice or rated clips.",
  };
  const exampleThree = t("example_three_body")
    .replace(
      "use conspicuousness 3 or another honest rating",
      "rate how noticeable it seemed independently, and use confidence 1 or 2",
    )
    .replace("诚实选择明显程度3或其他分数", "独立评价你觉得它有多明显，并将信心选1或2");
  const oldReturnText = "If the page still fails, note the problem and return the downloaded " +
    "response file manually as instructed by the study owner.";
  const playbackHelp = t("playback_help_body")
    .replace(
      oldReturnText,
      "If playback still fails, stop and report the clip and error; do not invent a rating. " +
      "On the same browser, refresh/resume to restore submitted answers; an unfinished form " +
      "may need to be redone. After completion, download the response file, save it as instructed, " +
      "return it privately, and keep the response code as a backup. No data is sent automatically.",
    )
    .replace(
      "如果仍然失败，请记录问题，并按研究负责人说明手动返回下载的回答文件。",
      "如果仍然失败，请停止并报告片段和错误，不要编造评分。同一浏览器刷新或恢复时，" +
      "已提交的回答会恢复；未完成的表单可能需要重做。完成后请按说明下载并保存回答文件，" +
      "私下返回，并保留回答代码作为备份。数据不会自动发送。",
    );
  const steps = [
    ["1", t("step1_title"), t("step1_body")],
    ["2", t("step2_title"), t("step2_body")],
    ["3", t("step3_title"), t("step3_body")],
  ];
  const examples = ["example_one", "example_two", "example_three"];
  return h(
    "div",
    { className: "instruction-guide" },
    h("p", { className: "lead" }, real ? realCopy.lead : t("instructions_lead")),
    h(
      "div",
      { className: "instruction-steps" },
      ...(real ? [
        ["1", "", realCopy.watch], ["2", "", realCopy.answer], ["3", "", realCopy.submit],
      ] : steps).map(([number, title, body]) =>
      h("article", { className: "instruction-step" },
        h("div", { className: "step-number", "aria-hidden": true }, number),
        h("div", {}, h("h3", {}, title), h("p", {}, body)),
      )),
    ),
    h("details", { className: "instruction-details" },
      h("summary", {}, t("rating_guide")),
      h("div", { className: "guide-grid" },
        !real ? h("section", {}, h("h3", {}, t("mcq_guide_title")), h("p", {}, t("mcq_guide_body"))) : null,
        h("section", {}, h("h3", {}, t("edited_guide_title")), h("p", {}, t("edited_guide_body"))),
        v2 ? h("section", {}, h("h3", {}, t("audio_clarity_title")),
          h("p", {}, t("audio_clarity_body"))) : null,
        v2 ? h("section", {}, h("h3", {}, t("visual_readability_title")),
          h("p", {}, t("visual_readability_body"))) : null,
        h("section", {}, h("h3", {}, t("conspicuousness_guide_title")),
          h("p", {}, t("conspicuousness_guide_body"))),
        h("section", {}, h("h3", {}, t("naturalness_guide_title")),
          h("p", {}, t("naturalness_guide_body"))),
        h("section", {}, h("h3", {}, t("confidence_guide_title")),
          h("p", {}, t("confidence_guide_body"))),
      ),
    ),
    h("details", { className: "instruction-details" },
      h("summary", {}, t("examples_title")),
      h("p", {}, t("examples_note")),
      h("div", { className: "worked-examples" }, ...examples.map((key) =>
        h("article", {}, h("h3", {}, t(`${key}_title`)),
          h("p", {}, key === "example_three" ? exampleThree : t(`${key}_body`)))),
      ),
    ),
    h("details", { className: "instruction-details" },
      h("summary", {}, t("playback_help_title")),
      h("p", {}, v2 ? playbackHelp
        .replace("No data is sent automatically.",
          "When a private collector is connected, submitted ratings are also sent automatically. " +
          "Only the Synced status confirms receipt; keep a downloaded backup. " +
          "Without a connected collector, nothing is sent automatically.")
        .replace("数据不会自动发送。", "接通私有收集端后，已提交评分也会自动发送；只有显示已同步才说明收到，请仍保留下载备份。未接通时不会自动发送。")
        : playbackHelp),
    ),
  );
}
