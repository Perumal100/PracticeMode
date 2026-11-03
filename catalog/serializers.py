from rest_framework import serializers

from reviewer.models import FormField, PracticeForm


MAX_CATEGORY_FILTERS = 10


class CatalogFilterSerializer(serializers.Serializer):
    keyword = serializers.CharField(required=False, max_length=200)
    # Repeatable: ?category=Housing&category=Education (US-02 AC-02).
    category = serializers.ListField(
        child=serializers.CharField(max_length=100), required=False, max_length=MAX_CATEGORY_FILTERS,
    )

    def validate(self, attrs):
        if set(self.initial_data) - set(self.fields):
            raise serializers.ValidationError({"filters": "Only the keyword and category filters are supported."})
        if len(self.initial_data.getlist("keyword")) > 1:
            raise serializers.ValidationError({"keyword": "Supply the keyword filter only once."})
        # DRF treats an optional empty QueryDict value as omitted. An explicitly
        # supplied empty filter is invalid, rather than an unfiltered request.
        if "keyword" in self.initial_data and not self.initial_data["keyword"].strip():
            raise serializers.ValidationError({"keyword": "The keyword filter cannot be blank."})
        if any(not value.strip() for value in self.initial_data.getlist("category")):
            raise serializers.ValidationError({"category": "A category filter cannot be blank."})
        return attrs


class FormSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = PracticeForm
        fields = ("id", "title", "status", "categories")


class FormFieldSerializer(serializers.ModelSerializer):
    class Meta:
        model = FormField
        fields = ("id", "position", "label", "input_type", "required", "validation")


class FormDetailSerializer(FormSummarySerializer):
    fields = FormFieldSerializer(many=True, read_only=True)

    class Meta(FormSummarySerializer.Meta):
        fields = (*FormSummarySerializer.Meta.fields, "fields")
