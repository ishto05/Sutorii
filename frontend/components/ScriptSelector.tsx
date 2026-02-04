"use client";

type SceneLine = {
    id: string;
    text: string;
};

type Props = {
    lines: SceneLine[];
    activeLineId: string | null;
    onSelect: (lineId: string) => void;
};

export default function ScriptSelector({
    lines,
    activeLineId,
    onSelect,
}: Props) {
    return (
        <div>
            <p>Script Selector (stub)</p>
            {lines.map((line) => (
                <button
                    key={line.id}
                    onClick={() => onSelect(line.id)}
                    style={{
                        fontWeight: line.id === activeLineId ? "bold" : "normal",
                    }}
                >
                    {line.text}
                </button>
            ))}
        </div>
    );
}
