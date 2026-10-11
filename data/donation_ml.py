"""Demo-only scikit-learn priority model for product donation items."""

import json
import sys
from itertools import product

from sklearn.tree import DecisionTreeClassifier


PRIORITY_LABELS = ("High Priority", "Standard", "Needs Inspection")
TRAINING_AGES_MONTHS = (0, 6, 12, 13, 24, 36, 59, 60, 120)


def _training_label(item_condition: int, item_age_months: int, is_essential: int) -> str:
    if item_condition <= 2 or item_age_months >= 60:
        return "Needs Inspection"
    if is_essential == 1 and item_condition >= 4 and item_age_months <= 12:
        return "High Priority"
    return "Standard"


def _train_model() -> DecisionTreeClassifier:
    examples = list(
        product(
            range(1, 6),
            TRAINING_AGES_MONTHS,
            (0, 1),
        )
    )
    features = [list(example) for example in examples]
    labels = [
        _training_label(item_condition, item_age_months, is_essential)
        for item_condition, item_age_months, is_essential in examples
    ]
    classifier = DecisionTreeClassifier(random_state=42)
    classifier.fit(features, labels)
    return classifier


_CLASSIFIER = _train_model()


def predict_priority(
    item_condition: int,
    item_age_months: int,
    is_essential: int,
) -> str:
    values = (item_condition, item_age_months, is_essential)
    if any(
        isinstance(value, bool) or not isinstance(value, int)
        for value in values
    ):
        raise ValueError("All donation model inputs must be integers.")
    if not 1 <= item_condition <= 5:
        raise ValueError("Item condition must be from 1 to 5.")
    if item_age_months < 0:
        raise ValueError("Item age must be a non-negative number of months.")
    if is_essential not in (0, 1):
        raise ValueError("Essential item must be 1 (yes) or 0 (no).")

    prediction = _CLASSIFIER.predict(
        [[item_condition, item_age_months, is_essential]]
    )[0]
    if prediction not in PRIORITY_LABELS:
        raise RuntimeError("The classifier returned an unsupported priority label.")
    return str(prediction)


def main() -> int:
    try:
        payload = json.load(sys.stdin)
        priority = predict_priority(
            payload["item_condition"],
            payload["item_age_months"],
            payload["is_essential"],
        )
    except (json.JSONDecodeError, KeyError, TypeError, ValueError) as error:
        print(str(error), file=sys.stderr)
        return 2

    print(json.dumps({"priority": priority}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())