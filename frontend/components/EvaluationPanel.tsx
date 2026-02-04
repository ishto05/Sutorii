"use client";

type Props = {
    result: any;
};

export default function EvaluationPanel({ result }: Props) {
    if (!result) return null;

    return (
        <div>
            <h3>Evaluation Result</h3>
            <pre>{JSON.stringify(result, null, 2)}</pre>
        </div>
    );
}
