from rest_framework import serializers

from reviewer.models import FormField, PracticeForm


class CatalogFilterSerializer(serializers.Serializer):
    keyword = serializers.CharField(required=False, max_length=200)

    def validate(self, attrs):
        if set(self.initial_data) - set(self.fields):
            raise serializers.ValidationError({"filters": "Only the keyword filter is supported."})
        if len(self.initial_data.getlist("keyword")) > 1:
            raise serializers.ValidationError({"keyword": "Supply the keyword filter only once."})
        # DRF treats an optional empty QueryDict value as omitted. An explicitly
        # supplied empty filter is invalid, rather than an unfiltered request.
        if "keyword" in self.initial_data and not self.initial_data["keyword"].strip():
            raise serializers.ValidationError({"keyword": "The keyword filter cannot be blank."})
        return attrs


class FormSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = PracticeForm
        fields = ("id", "title", "status")


class FormFieldSerializer(serializers.ModelSerializer):
    class Meta:
        model = FormField
        fields = ("id", "position", "label", "input_type", "required", "validation")


class FormDetailSerializer(FormSummarySerializer):
    fields = FormFieldSerializer(many=True, read_only=True)

    class Meta(FormSummarySerializer.Meta):
        fields = (*FormSummarySerializer.Meta.fields, "fields")
